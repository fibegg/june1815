import { randomUUID } from 'node:crypto';
import { June1815Error } from '../errors.js';
import type { Conversation } from './conversation.js';
import type { SessionMarkerStore } from './session-marker.js';

export interface CreateConversationOptions {
  /** Optional client-provided id. Defaults to a random UUID. */
  id?: string;
  /** Working directory for the spawned claude process. */
  cwd: string;
  /** Claude model override, passed via the wrapped CLI. */
  model?: string;
  /** Reasoning effort override. */
  effort?: string;
  /** Text appended to claude's system prompt. */
  systemPromptAppend?: string;
}

/** Factory that knows how to construct a Conversation. Production wires
 *  this to a function that spawns claude under node-pty; tests pass a
 *  fake factory. */
export interface ConversationFactory {
  create(opts: {
    id: string;
    cwd: string;
    model?: string;
    effort?: string;
    systemPromptAppend?: string;
    resumeSessionId?: string;
  }): Promise<Conversation>;
}

export interface ManagerOptions {
  readonly factory: ConversationFactory;
  readonly markers: SessionMarkerStore;
  readonly maxConversations: number;
}

/**
 * Owns the active set of conversations. Enforces the
 * `maxConversations` cap (per ADR-0002). On delete, the conversation is
 * killed and its session marker is left intact so it can be resumed later.
 */
export class ConversationManager {
  private readonly conversations = new Map<string, Conversation>();

  constructor(private readonly opts: ManagerOptions) {}

  list(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  size(): number {
    return this.conversations.size;
  }

  async create(opts: CreateConversationOptions): Promise<Conversation> {
    if (this.conversations.size >= this.opts.maxConversations) {
      throw new June1815Error(
        'conversation_limit_reached',
        `max ${this.opts.maxConversations} conversations active`,
      );
    }
    const id = opts.id ?? randomUUID();
    if (this.conversations.has(id)) {
      throw new June1815Error('conversation_busy', `conversation ${id} already exists`);
    }
    const resumeSessionId = this.opts.markers.read(id) ?? undefined;
    const factoryArgs: Parameters<ConversationFactory['create']>[0] = {
      id,
      cwd: opts.cwd,
    };
    if (opts.model !== undefined) factoryArgs.model = opts.model;
    if (opts.effort !== undefined) factoryArgs.effort = opts.effort;
    if (opts.systemPromptAppend !== undefined)
      factoryArgs.systemPromptAppend = opts.systemPromptAppend;
    if (resumeSessionId !== undefined) factoryArgs.resumeSessionId = resumeSessionId;
    const conv = await this.opts.factory.create(factoryArgs);
    this.conversations.set(id, conv);
    return conv;
  }

  async delete(id: string): Promise<void> {
    const conv = this.conversations.get(id);
    if (!conv) {
      throw new June1815Error('conversation_not_found', `no conversation ${id}`);
    }
    this.conversations.delete(id);
    conv.kill();
    // Markers are intentionally preserved so a future create() can resume.
    await Promise.resolve();
  }

  /** Best-effort shutdown of every conversation. Used at server stop. */
  async destroyAll(): Promise<void> {
    const ids = Array.from(this.conversations.keys());
    await Promise.all(ids.map((id) => this.delete(id).catch(() => undefined)));
  }
}
