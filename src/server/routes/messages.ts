import { z } from 'zod';
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ConversationManager } from '../../conversation/manager.js';
import type { Conversation, ConversationEvent } from '../../conversation/conversation.js';
import { June15Error } from '../../errors.js';
import type { SseEvent } from '../events.js';
import type { AppEnv } from '../server.js';

const SendBodySchema = z.object({
  text: z.string().min(1),
});
const SteerBodySchema = z.object({
  text: z.string().min(1),
});
const InterruptBodySchema = z.object({}).optional();

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

export function registerMessageRoutes(
  app: Hono<AppEnv>,
  deps: { conversations: ConversationManager },
): void {
  app.post('/v1/conversations/:id/messages', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    const body = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = SendBodySchema.safeParse(body);
    if (!parsed.success) throw new June15Error('http_bad_request', 'text required');

    const messageId = conv.send(parsed.data.text);
    return streamSSE(c, async (stream) => {
      await streamConversationUntilDone(stream, conv, messageId);
    });
  });

  app.post('/v1/conversations/:id/interrupt', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    await c.req.json().catch(() => undefined);
    const _check = InterruptBodySchema.parse(undefined);
    void _check;
    conv.interrupt();
    return c.json({ interrupted: true });
  });

  app.post('/v1/conversations/:id/queue', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    const body = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = SendBodySchema.safeParse(body);
    if (!parsed.success) throw new June15Error('http_bad_request', 'text required');
    const messageId = conv.send(parsed.data.text);
    return c.json({ messageId, queued: true });
  });

  app.post('/v1/conversations/:id/steer', async (c) => {
    const id = c.req.param('id');
    const conv = deps.conversations.get(id);
    if (!conv) throw new June15Error('conversation_not_found', id);
    const body = await c.req.json().catch(() => {
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
    while (true) {
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
