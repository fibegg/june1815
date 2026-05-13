import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv } from '../server.js';
import type { AuthService } from '../auth-service.js';
import { June15Error } from '../../errors.js';

const TokenBodySchema = z.object({
  token: z.string().min(16).max(4096),
});

export function registerAuthRoutes(
  app: Hono<AppEnv>,
  deps: { auth: AuthService },
): void {
  app.get('/v1/auth/status', (c) => {
    const info = deps.auth.status();
    const base: { authenticated: boolean; source: string; envKey?: string; path?: string } = {
      authenticated: info.authenticated,
      source: info.source,
    };
    if (info.envKey !== undefined) base.envKey = info.envKey;
    if (info.path !== undefined) base.path = info.path;
    return c.json(base);
  });

  app.post('/v1/auth/token', async (c) => {
    const body = await c.req.json().catch(() => {
      throw new June15Error('http_bad_request', 'invalid JSON body');
    });
    const parsed = TokenBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new June15Error('http_bad_request', 'token must be 16..4096 chars');
    }
    deps.auth.setToken(parsed.data.token);
    return c.json({ stored: true });
  });

  app.delete('/v1/auth', (c) => {
    deps.auth.clear();
    return c.body(null, 204);
  });
}
