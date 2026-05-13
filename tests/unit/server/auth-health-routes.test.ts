import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerAuthRoutes } from '../../../src/server/routes/auth.js';
import { registerHealthRoute } from '../../../src/server/routes/health.js';
import type { AppEnv } from '../../../src/server/server.js';
import { errorHandler } from '../../../src/server/middleware/error.js';
import type { AuthService } from '../../../src/server/auth-service.js';
import type { AuthInfo } from '../../../src/claude/auth-detector.js';

function fakeAuth(info: AuthInfo): AuthService {
  return {
    status: () => Promise.resolve(info),
    statusLocal: () => info,
    setToken: vi.fn(),
    clear: vi.fn(),
  } as unknown as AuthService;
}

function appWith(auth: AuthService, health = { version: '0.0.0', startedAt: new Date(0).toISOString() }): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  registerHealthRoute(app, health);
  registerAuthRoutes(app, { auth });
  app.onError(errorHandler());
  return app;
}

describe('GET /healthz', () => {
  it('returns 200 with status info', async () => {
    const res = await appWith(fakeAuth({ authenticated: false, source: 'none' })).fetch(
      new Request('http://t/healthz'),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; version: string };
    expect(body.status).toBe('ok');
    expect(body.version).toBe('0.0.0');
  });
});

describe('GET /v1/auth/status', () => {
  it('returns the source and envKey for env-based auth', async () => {
    const auth = fakeAuth({ authenticated: true, source: 'env_oauth', envKey: 'CLAUDE_CODE_OAUTH_TOKEN' });
    const res = await appWith(auth).fetch(new Request('http://t/v1/auth/status'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authenticated: boolean; source: string; envKey?: string };
    expect(body).toEqual({
      authenticated: true,
      source: 'env_oauth',
      envKey: 'CLAUDE_CODE_OAUTH_TOKEN',
    });
  });

  it('returns just authenticated/source when no env key', async () => {
    const auth = fakeAuth({ authenticated: false, source: 'none' });
    const res = await appWith(auth).fetch(new Request('http://t/v1/auth/status'));
    const body = (await res.json()) as { authenticated: boolean; source: string };
    expect(body).toEqual({ authenticated: false, source: 'none' });
  });
});

describe('POST /v1/auth/token', () => {
  it('stores a valid token', async () => {
    const setToken = vi.fn();
    const auth = {
      status: () => Promise.resolve({ authenticated: false, source: 'none' as const }),
      setToken,
      clear: vi.fn(),
    } as unknown as AuthService;
    const res = await appWith(auth).fetch(
      new Request('http://t/v1/auth/token', {
        method: 'POST',
        body: JSON.stringify({ token: 'a'.repeat(32) }),
      }),
    );
    expect(res.status).toBe(200);
    expect(setToken).toHaveBeenCalledWith('a'.repeat(32));
  });

  it('rejects a too-short token', async () => {
    const res = await appWith(fakeAuth({ authenticated: false, source: 'none' })).fetch(
      new Request('http://t/v1/auth/token', {
        method: 'POST',
        body: JSON.stringify({ token: 'short' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE /v1/auth', () => {
  it('clears and returns 204', async () => {
    const clear = vi.fn();
    const auth = {
      status: () => Promise.resolve({ authenticated: false, source: 'none' as const }),
      setToken: vi.fn(),
      clear,
    } as unknown as AuthService;
    const res = await appWith(auth).fetch(
      new Request('http://t/v1/auth', { method: 'DELETE' }),
    );
    expect(res.status).toBe(204);
    expect(clear).toHaveBeenCalled();
  });
});
