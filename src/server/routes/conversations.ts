import { z } from 'zod';
import type { Hono } from 'hono';
import type { ConversationManager } from '../../conversation/manager.js';
import { June15Error } from '../../errors.js';
import type { AppEnv } from '../server.js';

const CreateBodySchema = z.object({
  id: z.string().min(1).max(128).optional(),
  cwd: z.string().min(1),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  systemPromptAppend: z.string().optional(),
});

function summarize(c: { id: string; cwd: string; state: string; pendingCount: number }): {
  id: string;
  cwd: string;
  state: string;
  pendingCount: number;
} {
  return { id: c.id, cwd: c.cwd, state: c.state, pendingCount: c.pendingCount };
}

export function registerConversationRoutes(
  app: Hono<AppEnv>,
  deps: { conversations: ConversationManager },
): void {
  app.get('/v1/conversations', (c) => {
    const list = deps.conversations.list().map((conv) =>
      summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount,
      }),
    );
    return c.json({ conversations: list });
  });

  app.post('/v1/conversations', async (c) => {
    const body = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new June15Error('http_bad_request', parsed.error.issues.map((i) => i.message).join('; '));
    }
    const conv = await deps.conversations.create(parsed.data);
    return c.json(
      summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount,
      }),
      201,
    );
  });

  app.get('/v1/conversations/:id', (c) => {
    const conv = deps.conversations.get(c.req.param('id'));
    if (!conv) throw new June15Error('conversation_not_found', c.req.param('id'));
    return c.json(
      summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount,
      }),
    );
  });

  app.delete('/v1/conversations/:id', async (c) => {
    await deps.conversations.delete(c.req.param('id'));
    return c.body(null, 204);
  });
}
