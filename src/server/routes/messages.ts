import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ConversationManager } from '../../conversation/manager.js';
import type { Conversation, ConversationEvent } from '../../conversation/conversation.js';
import type {
  AttachmentInput,
  SavedAttachment,
  UploadStore,
} from '../../conversation/upload-store.js';
import { June15Error } from '../../errors.js';
import type { SseEvent } from '../events.js';
import type { AppEnv } from '../server.js';

const AttachmentSchema = z.object({
  kind: z.enum(['image', 'file']),
  dataUrl: z.string().min(8).max(20 * 1024 * 1024),
  contentType: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(256).optional(),
});

const SendBodySchema = z.object({
  text: z.string().min(1),
  attachments: z.array(AttachmentSchema).max(16).optional(),
});
const SteerBodySchema = z.object({
  text: z.string().min(1),
});

/** Normalize a zod-parsed attachment into the `AttachmentInput` shape the
 *  UploadStore expects (drop `undefined` optionals so exactOptionalPropertyTypes
 *  doesn't complain). */
function toAttachmentInput(
  a: z.infer<typeof AttachmentSchema>,
): AttachmentInput {
  const out: AttachmentInput = { kind: a.kind, dataUrl: a.dataUrl };
  if (a.contentType !== undefined) (out as { contentType?: string }).contentType = a.contentType;
  if (a.name !== undefined) (out as { name?: string }).name = a.name;
  return out;
}

/** Saves each attachment under the conversation's upload directory and
 *  returns the resulting `SavedAttachment` records for the Conversation to
 *  splice into the outgoing text. Throws `June15Error('http_bad_request')`
 *  on malformed data URLs. */
function saveAttachments(
  store: UploadStore,
  attachments: readonly z.infer<typeof AttachmentSchema>[],
): { messageId: string; saved: readonly SavedAttachment[] } {
  const messageId = randomUUID();
  const saved = attachments.map((a, i) => {
    try {
      return store.save(messageId, toAttachmentInput(a), i);
    } catch (err) {
      throw new June15Error(
        'http_bad_request',
        `attachment[${i}]: ${(err as Error).message}`,
      );
    }
  });
  return { messageId, saved };
}

export interface MessageRouteDeps {
  readonly conversations: ConversationManager;
  /** Optional. When supplied, the messages route accepts attachments. */
  readonly uploadStoreFor?: (conversationId: string) => UploadStore | undefined;
}

/**
 * Map an internal `ConversationEvent` to the externally-visible `SseEvent`.
 * Returns null for internal-only events that should not reach clients.
 * The `messageId` filter ensures the SSE stream only emits the terminal
 * `done` event for the message that initiated the stream.
 */
function bridge(e: ConversationEvent, messageId: string): SseEvent | null {
  switch (e.type) {
    case 'text_delta':
      return { type: 'text_delta', text: e.text };
    case 'reasoning_delta':
      return { type: 'reasoning_delta', text: e.text };
    case 'tool_use':
      return e.summary !== undefined
        ? { type: 'tool_use', name: e.name, summary: e.summary }
        : { type: 'tool_use', name: e.name };
    case 'usage':
      return { type: 'usage', inputTokens: e.inputTokens, outputTokens: e.outputTokens };
    case 'permission_prompt':
      return { type: 'permission_prompt', question: e.question };
    case 'auth_required':
      return { type: 'auth_required', url: e.url, method: 'oauth' };
    case 'message_completed':
      return e.messageId === messageId ? { type: 'done', messageId } : null;
    case 'pty_exited':
      return {
        type: 'error',
        code: 'pty_dead',
        message: `pty exited (code ${e.exitCode}${e.signal !== null ? `, signal ${e.signal}` : ''})`,
      };
    default:
      return null;
  }
}

export function registerMessageRoutes(app: Hono<AppEnv>, deps: MessageRouteDeps): void {
  const dispatchSend = async (
    c: Context<AppEnv>,
    intent: 'stream' | 'queue',
  ): Promise<Response> => {
    const id = c.req.param('id') ?? '';
    if (id.length === 0) throw new June15Error('http_bad_request', 'missing conversation id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    const body: unknown = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = SendBodySchema.safeParse(body);
    if (!parsed.success) throw new June15Error('http_bad_request', 'text required');

    const attachments = parsed.data.attachments ?? [];
    let messageId: string;
    if (attachments.length > 0) {
      const store = deps.uploadStoreFor?.(id);
      if (!store) {
        throw new June15Error(
          'http_bad_request',
          'attachments not supported on this server (uploadStoreFor not configured)',
        );
      }
      const { saved } = saveAttachments(store, attachments);
      messageId = conv.sendWithAttachments({ text: parsed.data.text, attachments: saved });
    } else {
      messageId = conv.send(parsed.data.text);
    }

    if (intent === 'queue') {
      return c.json({ messageId, queued: true });
    }
    return streamSSE(c, async (stream) => {
      await streamConversationUntilDone(stream, conv, messageId);
    });
  };

  app.post('/v1/conversations/:id/messages', (c) => dispatchSend(c, 'stream'));
  app.post('/v1/conversations/:id/queue', (c) => dispatchSend(c, 'queue'));

  app.post('/v1/conversations/:id/interrupt', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    await c.req.json().catch(() => undefined);
    conv.interrupt();
    return c.json({ interrupted: true });
  });

  app.post('/v1/conversations/:id/steer', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    const body: unknown = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = SteerBodySchema.safeParse(body);
    if (!parsed.success) throw new June15Error('http_bad_request', 'text required');
    const messageId = conv.steer(parsed.data.text);
    return c.json({ messageId, steered: true });
  });
}

/** Helper used by the SSE handler. Exported for unit testing. */
export async function streamConversationUntilDone(
  stream: {
    writeSSE(payload: { event: string; data: string }): Promise<void>;
    close(): Promise<void>;
  },
  conv: Conversation,
  messageId: string,
): Promise<void> {
  const queued: ConversationEvent[] = [];
  let resolveWaiter: (() => void) | null = null;
  const wake = (): void => {
    if (resolveWaiter) {
      const r = resolveWaiter;
      resolveWaiter = null;
      r();
    }
  };
  const unsubscribe = conv.onEvent((e) => {
    queued.push(e);
    wake();
  });

  try {
    for (;;) {
      if (queued.length === 0) {
        await new Promise<void>((resolve) => {
          resolveWaiter = resolve;
        });
      }
      const next = queued.shift();
      if (!next) continue;
      const sse = bridge(next, messageId);
      if (!sse) continue;
      await stream.writeSSE({ event: sse.type, data: JSON.stringify(sse) });
      if (sse.type === 'done' || sse.type === 'error') {
        await stream.close();
        return;
      }
    }
  } finally {
    unsubscribe();
  }
}
