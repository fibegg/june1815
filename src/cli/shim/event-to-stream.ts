import { randomUUID } from 'node:crypto';
import type { ConversationEvent } from '../../conversation/conversation.js';
import type { ToolInputSynthesizer } from '../../tools/synthesizer.js';
import type {
  AssistantContent,
  AssistantContentToolUse,
  AssistantMessage,
  OutboundMessage,
  Result,
  StreamEventMessage,
  SystemInit,
  Usage,
} from './sdk-types.js';

/** Sink the writer pushes serialized NDJSON to. */
export interface NdjsonSink {
  write(line: string): void;
}

export interface EventToStreamOpts {
  readonly sessionId: string;
  readonly cwd: string;
  readonly model: string;
  readonly permissionMode: string;
  readonly synthesizer: ToolInputSynthesizer;
  /** Override for tests; defaults to `Date.now()`. */
  readonly now?: () => number;
  /** Override for tests; defaults to `randomUUID()`. */
  readonly uuid?: () => string;
}

/**
 * Translates the stream of `ConversationEvent`s from a wrapped claude
 * session into the wire-protocol NDJSON the stream-json consumer
 * expects.
 *
 * Stateful: one instance per shim invocation. Per-turn accumulators
 * (assistant text, tool-use blocks, errors, usage) reset at every
 * `turn_complete`. Cross-turn state (session_id, model) is constant.
 */
export class EventToStream {
  private readonly sessionId: string;
  private readonly cwd: string;
  private readonly model: string;
  private readonly permissionMode: string;
  private readonly synthesizer: ToolInputSynthesizer;
  private readonly now: () => number;
  private readonly uuid: () => string;

  private turnStartedAt = 0;
  private numTurns = 0;
  private assistantText = '';
  private assistantContent: AssistantContent[] = [];
  private blockIndex = 0;
  private pendingErrors: string[] = [];
  private usage: Usage = { input_tokens: 0, output_tokens: 0 };

  constructor(opts: EventToStreamOpts) {
    this.sessionId = opts.sessionId;
    this.cwd = opts.cwd;
    this.model = opts.model;
    this.permissionMode = opts.permissionMode;
    this.synthesizer = opts.synthesizer;
    this.now = opts.now ?? (() => Date.now());
    this.uuid = opts.uuid ?? (() => randomUUID());
  }

  /** Emit the one-time `system/init` line. */
  emitInit(sink: NdjsonSink): void {
    const msg: SystemInit = {
      type: 'system',
      subtype: 'init',
      cwd: this.cwd,
      tools: [],
      mcp_servers: [],
      model: this.model,
      permissionMode: this.permissionMode,
      uuid: this.uuid(),
      session_id: this.sessionId,
    };
    emit(sink, msg);
    this.turnStartedAt = this.now();
  }

  /** Mark a new turn as starting (resets per-turn buffers). */
  beginTurn(): void {
    this.assistantText = '';
    this.assistantContent = [];
    this.blockIndex = 0;
    this.pendingErrors = [];
    this.turnStartedAt = this.now();
  }

  /**
   * Route one `ConversationEvent` through the wire mapping. Returns the
   * lines emitted on this call so tests can introspect without touching
   * the sink — they're also written to `sink`.
   */
  private announcedToolKeys = new Set<string>();

  onEvent(e: ConversationEvent, sink: NdjsonSink): void {
    switch (e.type) {
      case 'text_delta':
        { this.onText(e.text, sink); return; }
      case 'reasoning_delta':
        { this.onThinking(e.text, sink); return; }
      case 'tool_use':
        { this.onToolUse(e.name, e.summary ?? '', sink); return; }
      case 'tool_result':
        // Claude's TUI sometimes renders only the tool RESULT line (e.g.
        // `⎿ Read /path (68 bytes)`) without a separate `⏺ Tool(args)`
        // call line — typical for instantaneous reads. The wire-protocol
        // consumer still expects a tool_use event, so we synthesize one
        // from the result. Deduped by `name|summary` to avoid double-
        // firing when both lines do appear.
        { this.onToolUse(e.name, e.summary, sink); return; }
      case 'usage':
        this.usage = {
          input_tokens: e.inputTokens,
          output_tokens: e.outputTokens,
        };
        return;
      case 'error':
        this.pendingErrors.push(`${e.code}: ${e.message}`);
        return;
      case 'auth_required':
        this.pendingErrors.push(`auth_required: ${e.url}`);
        return;
      case 'turn_complete':
        { this.flushTurn(sink); return; }
      case 'ready':
      case 'permission_prompt':
      case 'trust_prompt':
      case 'state_change':
      case 'message_started':
      case 'message_completed':
        return;
      case 'pty_exited':
        // PTY died unexpectedly: emit a terminal error result so the
        // consumer doesn't hang waiting for a response.
        this.pendingErrors.push(`pty_exited: code=${e.exitCode}`);
        { this.flushTurn(sink); return; }
      default:
        return;
    }
  }

  private onText(delta: string, sink: NdjsonSink): void {
    if (delta.length === 0) return;
    this.assistantText += delta;
    const msg: StreamEventMessage = {
      type: 'stream_event',
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: 'content_block_delta',
        index: this.blockIndex,
        delta: { type: 'text_delta', text: delta },
      },
    };
    emit(sink, msg);
  }

  private onThinking(delta: string, sink: NdjsonSink): void {
    if (delta.length === 0) return;
    const msg: StreamEventMessage = {
      type: 'stream_event',
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: 'content_block_delta',
        index: this.blockIndex,
        delta: { type: 'thinking_delta', thinking: delta },
      },
    };
    emit(sink, msg);
  }

  private onToolUse(name: string, summary: string, sink: NdjsonSink): void {
    const key = `${name}|${summary}`;
    if (this.announcedToolKeys.has(key)) return;
    this.announcedToolKeys.add(key);
    const input = this.synthesizer.synthesize(name, summary);
    const id = `toolu_${this.uuid()}`;
    this.blockIndex += 1;
    const start: StreamEventMessage = {
      type: 'stream_event',
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: 'content_block_start',
        index: this.blockIndex,
        content_block: { type: 'tool_use', id, name, input },
      },
    };
    emit(sink, start);
    const stop: StreamEventMessage = {
      type: 'stream_event',
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: { type: 'content_block_stop', index: this.blockIndex },
    };
    emit(sink, stop);
    const block: AssistantContentToolUse = { type: 'tool_use', id, name, input };
    this.assistantContent.push(block);
    this.blockIndex += 1; // next text/thinking goes into a fresh block.
  }

  private flushTurn(sink: NdjsonSink): void {
    this.numTurns += 1;
    const duration_ms = Math.max(0, this.now() - this.turnStartedAt);
    const finalContent: AssistantContent[] =
      this.assistantText.length > 0
        ? [...this.assistantContent, { type: 'text', text: this.assistantText }]
        : [...this.assistantContent];
    const assistant: AssistantMessage = {
      type: 'assistant',
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      message: {
        id: `msg_${this.uuid()}`,
        type: 'message',
        role: 'assistant',
        model: this.model,
        content: finalContent,
        stop_reason: this.pendingErrors.length > 0 ? 'error' : 'end_turn',
        stop_sequence: null,
        usage: this.usage,
      },
    };
    emit(sink, assistant);

    let result: Result;
    if (this.pendingErrors.length > 0) {
      result = {
        type: 'result',
        subtype: 'error',
        duration_ms,
        duration_api_ms: duration_ms,
        is_error: true,
        num_turns: this.numTurns,
        result: this.assistantText,
        errors: [...this.pendingErrors],
        usage: this.usage,
        modelUsage: {},
        permission_denials: [],
        uuid: this.uuid(),
        session_id: this.sessionId,
      };
    } else {
      result = {
        type: 'result',
        subtype: 'success',
        duration_ms,
        duration_api_ms: duration_ms,
        is_error: false,
        num_turns: this.numTurns,
        result: this.assistantText,
        stop_reason: 'end_turn',
        total_cost_usd: 0,
        usage: this.usage,
        modelUsage: {},
        permission_denials: [],
        uuid: this.uuid(),
        session_id: this.sessionId,
      };
    }
    emit(sink, result);

    // Reset per-turn state. Usage carries across since claude may emit it
    // sparingly, but the next turn's usage events will overwrite.
    this.assistantText = '';
    this.assistantContent = [];
    this.blockIndex = 0;
    this.pendingErrors = [];
    this.announcedToolKeys = new Set();
  }

  /**
   * Emit a synthetic `result/error` directly. Used by the runner when
   * something fails before claude is even spawned (e.g. JUNE1815_CLAUDE_PATH
   * missing). Doesn't touch turn counters.
   */
  emitStartupError(sink: NdjsonSink, message: string): void {
    const result: Result = {
      type: 'result',
      subtype: 'error',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      result: '',
      errors: [message],
      usage: { input_tokens: 0, output_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      uuid: this.uuid(),
      session_id: this.sessionId,
    };
    emit(sink, result);
  }
}

function emit(sink: NdjsonSink, msg: OutboundMessage): void {
  sink.write(`${JSON.stringify(msg)}\n`);
}
