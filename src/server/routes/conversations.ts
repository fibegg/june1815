import { z } from 'zod';
import type { Hono } from 'hono';
import type { ConversationManager } from '../../conversation/manager.js';
import { June1815Error } from '../../errors.js';
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
    const body: unknown = await c.req.json().catch(() => {
      throw new June1815Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new June1815Error('http_bad_request', parsed.error.issues.map((i) => i.message).join('; '));
    }
    const args: Parameters<typeof deps.conversations.create>[0] = { cwd: parsed.data.cwd };
    if (parsed.data.id !== undefined) args.id = parsed.data.id;
    if (parsed.data.model !== undefined) args.model = parsed.data.model;
    if (parsed.data.effort !== undefined) args.effort = parsed.data.effort;
    if (parsed.data.systemPromptAppend !== undefined) args.systemPromptAppend = parsed.data.systemPromptAppend;
    const conv = await deps.conversations.create(args);
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
    if (!conv) throw new June1815Error('conversation_not_found', c.req.param('id'));
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
