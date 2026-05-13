import { randomUUID } from 'node:crypto';
import { June15Error } from '../errors.js';
import type { ClaudePty, PtyExit } from '../pty/claude-pty.js';
import type { InputDriver } from '../pty/input-driver.js';
import type { TerminalAdapter } from '../pty/terminal.js';
import type { TuiEvent, TuiParser } from '../pty/tui-parser.js';
import { MessageQueue, type QueuedMessage } from './queue.js';
import { composeMessageWithAttachments, type SavedAttachment } from './upload-store.js';

export type ConversationState = 'starting' | 'ready' | 'busy' | 'killed';

/** Public event stream type. Adds state-change / pty-exit signals to the
 *  base `TuiEvent` set. */
export type ConversationEvent =
  | TuiEvent
  | { readonly type: 'state_change'; readonly from: ConversationState; readonly to: ConversationState }
  | { readonly type: 'pty_exited'; readonly exitCode: number; readonly signal: number | null }
  | { readonly type: 'message_started'; readonly messageId: string }
  | { readonly type: 'message_completed'; readonly messageId: string };

export interface ConversationDeps {
  readonly id: string;
  readonly cwd: string;
  readonly pty: ClaudePty;
  readonly terminal: TerminalAdapter;
  readonly parser: TuiParser;
  readonly driver: InputDriver;
  readonly queue?: MessageQueue;
  readonly idleQuietMs: number;
  readonly maxBurstMs?: number;
  /** Override `setTimeout` / `clearTimeout` for deterministic tests. */
  readonly timers?: ConversationTimers;
}

export interface ConversationTimers {
  setTimeout(fn: () => void, ms: number): NodeJS.Timeout | number;
  clearTimeout(handle: NodeJS.Timeout | number): void;
}

const realTimers: ConversationTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => { clearTimeout(h); },
};

/**
 * The unit that wires together PTY + terminal + parser + driver + queue.
 * One per `conversation_id`. Owns the lifecycle and emits a typed event
 * stream to subscribers.
 */
export class Conversation {
  readonly id: string;
  readonly cwd: string;

  private readonly pty: ClaudePty;
  private readonly terminal: TerminalAdapter;
  private readonly parser: TuiParser;
  private readonly driver: InputDriver;
  private readonly queue: MessageQueue;
  private readonly idleQuietMs: number;
  private readonly maxBurstMs: number;
  private readonly timers: ConversationTimers;

  private _state: ConversationState = 'starting';
  private readonly subscribers = new Set<(e: ConversationEvent) => void>();

  private dataTimer: NodeJS.Timeout | number | null = null;
  private burstTimer: NodeJS.Timeout | number | null = null;
  private lastWrite: Promise<void> = Promise.resolve();

  private readyResolvers: (() => void)[] = [];
  private readyRejecters: ((e: Error) => void)[] = [];

  constructor(deps: ConversationDeps) {
    this.id = deps.id;
    this.cwd = deps.cwd;
    this.pty = deps.pty;
    this.terminal = deps.terminal;
    this.parser = deps.parser;
    this.driver = deps.driver;
    this.queue = deps.queue ?? new MessageQueue();
    this.idleQuietMs = deps.idleQuietMs;
    this.maxBurstMs = deps.maxBurstMs ?? Math.max(deps.idleQuietMs * 20, 200);
    this.timers = deps.timers ?? realTimers;

    this.pty.onData((d) => { this.onPtyData(d); });
    this.pty.onExit((info) => { this.onPtyExit(info); });
  }

  get state(): ConversationState {
    return this._state;
  }

  get pendingCount(): number {
    return this.queue.size;
  }

  /** Subscribe to events. Returns an unsubscribe function. */
  onEvent(cb: (event: ConversationEvent) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /** Wait for the conversation to reach `ready` state. Rejects on
   *  pty_exit or after `timeoutMs`. */
  waitForReady(timeoutMs = 30_000): Promise<void> {
    if (this._state === 'ready' || this._state === 'busy') return Promise.resolve();
    if (this._state === 'killed') {
      return Promise.reject(new June15Error('pty_dead', 'pty already exited'));
    }
    return new Promise<void>((resolve, reject) => {
      this.readyResolvers.push(resolve);
      this.readyRejecters.push(reject);
      const t = this.timers.setTimeout(() => {
        reject(new June15Error('pty_dead', `timed out after ${timeoutMs}ms waiting for ready`));
      }, timeoutMs);
      // Best-effort cleanup if we resolve normally.
      const cleanup = (): void => {
        this.timers.clearTimeout(t);
      };
      this.readyResolvers.push(cleanup);
    });
  }

  /** Enqueue a message; drain immediately if the PTY is idle. Returns the
   *  message id. */
  send(text: string): string {
    if (this._state === 'killed') {
      throw new June15Error('pty_dead', 'cannot send to a killed conversation');
    }
    const msg: QueuedMessage = { id: randomUUID(), text, enqueuedAt: Date.now() };
    this.queue.enqueue(msg);
    this.drain();
    return msg.id;
  }

  /**
   * Send a message with attachments. Each `SavedAttachment` was already
   * written to disk by an `UploadStore`; this method only composes the
   * outgoing text (prepending `@<path>` references per file) and forwards
   * to `send()`. The returned id is the same as if `send()` were called
   * with the composed text.
   */
  sendWithAttachments(input: {
    readonly text: string;
    readonly attachments: readonly SavedAttachment[];
  }): string {
    const composed = composeMessageWithAttachments(input.text, input.attachments);
    return this.send(composed);
  }

  interrupt(): void {
    if (this._state !== 'busy') return;
    this.driver.interrupt();
    this.queue.interrupt();
  }

  /**
   * Steer the in-flight turn — write a new message at the steer prefix and
   * replace the in-flight slot. If nothing is in flight, the behavior
   * degrades gracefully to `send()`.
   */
  steer(text: string): string {
    if (this._state !== 'busy') return this.send(text);
    const msg: QueuedMessage = { id: randomUUID(), text, enqueuedAt: Date.now() };
    this.queue.steer(msg);
    this.driver.steer(text);
    return msg.id;
  }

  kill(signal?: string): void {
    if (this._state === 'killed') return;
    this.cancelTimers();
    this.setState('killed');
    this.pty.kill(signal);
  }

  /** For tests: take a snapshot now without waiting for idle. */
  snapshotNow(): Promise<void> {
    return this.snapshotInternal();
  }

  // -------------------------------------------------------------------------

  private onPtyData(data: string): void {
    this.lastWrite = this.lastWrite.then(() => this.terminal.write(data));
    this.scheduleSnapshot();
  }

  private onPtyExit(info: PtyExit): void {
    this.cancelTimers();
    const wasKilled = this._state === 'killed';
    this.setState('killed');
    this.emit({ type: 'pty_exited', exitCode: info.exitCode, signal: info.signal });
    if (!wasKilled) {
      for (const reject of this.readyRejecters)
        reject(new June15Error('pty_dead', `pty exited (code ${info.exitCode}) before ready`));
      this.readyRejecters = [];
      this.readyResolvers = [];
    }
  }

  private scheduleSnapshot(): void {
    if (this.dataTimer !== null) this.timers.clearTimeout(this.dataTimer);
    this.dataTimer = this.timers.setTimeout(() => {
      void this.snapshotInternal();
    }, this.idleQuietMs);
    this.burstTimer ??= this.timers.setTimeout(() => {
      void this.snapshotInternal();
    }, this.maxBurstMs);
  }

  private async snapshotInternal(): Promise<void> {
    this.cancelTimers();
    await this.lastWrite;
    if (this._state === 'killed') return;
    const snap = this.terminal.snapshot();
    const events = this.parser.parse(snap);
    for (const e of events) this.handleParserEvent(e);
  }

  private handleParserEvent(e: TuiEvent): void {
    if (e.type === 'ready' && this._state === 'starting') {
      this.setState('ready');
      for (const resolve of this.readyResolvers) resolve();
      this.readyResolvers = [];
      this.readyRejecters = [];
      this.emit(e);
      this.drain();
      return;
    }
    if (e.type === 'turn_complete' && this._state === 'busy') {
      const inFlightId = this.queue.inFlight?.id;
      this.queue.complete();
      if (inFlightId !== undefined) {
        this.emit({ type: 'message_completed', messageId: inFlightId });
      }
      this.setState('ready');
      this.emit(e);
      this.drain();
      return;
    }
    this.emit(e);
  }

  private drain(): void {
    if (this._state !== 'ready') return;
    if (this.queue.inFlight) return;
    const next = this.queue.dequeue();
    if (!next) return;
    this.setState('busy');
    this.parser.markTurnStarted();
    this.emit({ type: 'message_started', messageId: next.id });
    this.driver.send(next.text);
  }

  private setState(s: ConversationState): void {
    if (this._state === s) return;
    const from = this._state;
    this._state = s;
    this.emit({ type: 'state_change', from, to: s });
  }

  private emit(e: ConversationEvent): void {
    for (const cb of this.subscribers) {
      try {
        cb(e);
      } catch {
        // Subscriber failures must not break event delivery.
      }
    }
  }

  private cancelTimers(): void {
    if (this.dataTimer !== null) {
      this.timers.clearTimeout(this.dataTimer);
      this.dataTimer = null;
    }
    if (this.burstTimer !== null) {
      this.timers.clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }
}
