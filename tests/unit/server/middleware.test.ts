import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { bearerAuthMiddleware } from '../../../src/server/middleware/bearer-auth.js';
import { errorHandler } from '../../../src/server/middleware/error.js';
import { requestIdMiddleware } from '../../../src/server/middleware/request-id.js';
import { June15Error } from '../../../src/errors.js';

describe('requestIdMiddleware', () => {
  it('echoes an incoming x-request-id header back', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware());
    app.get('/x', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://test/x', { headers: { 'x-request-id': 'r-1' } }));
    expect(res.headers.get('x-request-id')).toBe('r-1');
  });

  it('generates a uuid when no incoming id', async () => {
    const app = new Hono();
    app.use('*', requestIdMiddleware());
    app.get('/x', (c) => c.text('ok'));
    const res = await app.fetch(new Request('http://test/x'));
    const id = res.headers.get('x-request-id');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('bearerAuthMiddleware', () => {
  function makeApp(opts: { token: string; publicPaths?: readonly string[] }): Hono {
    const app = new Hono();
    app.use('*', bearerAuthMiddleware(opts));
    app.get('/v1/x', (c) => c.json({ ok: true }));
    app.get('/healthz', (c) => c.text('ok'));
    return app;
  }

  it('rejects without authorization header', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(new Request('http://t/v1/x'));
    expect(res.status).toBe(401);
  });

  it('rejects wrong token', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x', { headers: { authorization: 'Bearer wrong' } }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts correct bearer', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(res.status).toBe(200);
  });

  it('bypasses the check for public paths', async () => {
    const res = await makeApp({ token: 'secret', publicPaths: ['/healthz'] }).fetch(
      new Request('http://t/healthz'),
    );
    expect(res.status).toBe(200);
  });

  it('accepts the token from a ?token=... query parameter', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x?token=secret'),
    );
    expect(res.status).toBe(200);
  });

  it('rejects a wrong ?token= value', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x?token=wrong'),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the token from the configured cookie', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x', { headers: { cookie: 'june15_token=secret' } }),
    );
    expect(res.status).toBe(200);
  });

  it('decodes percent-encoded cookie values', async () => {
    const res = await makeApp({ token: 'a/b%c' }).fetch(
      new Request('http://t/v1/x', {
        headers: { cookie: `june15_token=${encodeURIComponent('a/b%c')}` },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('plants a Set-Cookie after a successful GET header-auth', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/june15_token=secret/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Strict/);
  });

  it('plants a Set-Cookie after a successful GET query-auth', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x?token=secret'),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/june15_token=secret/);
  });

  it('does NOT plant a Set-Cookie when auth came from the cookie itself', async () => {
    const res = await makeApp({ token: 'secret' }).fetch(
      new Request('http://t/v1/x', { headers: { cookie: 'june15_token=secret' } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('does NOT plant a Set-Cookie on non-GET requests', async () => {
    const app = new Hono();
    app.use('*', bearerAuthMiddleware({ token: 'secret' }));
    app.post('/v1/x', (c) => c.json({ ok: true }));
    const res = await app.fetch(
      new Request('http://t/v1/x', {
        method: 'POST',
        headers: { authorization: 'Bearer secret' },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('omits the Secure flag when cookieInsecure is true', async () => {
    const app = new Hono();
    app.use('*', bearerAuthMiddleware({ token: 'secret', cookieInsecure: true }));
    app.get('/x', (c) => c.text('ok'));
    const res = await app.fetch(
      new Request('http://t/x', { headers: { authorization: 'Bearer secret' } }),
    );
    expect(res.headers.get('set-cookie')).not.toMatch(/Secure/);
  });
});

describe('errorHandler', () => {
  it('maps a known June15Error code to its HTTP status', async () => {
    const app = new Hono();
    app.get('/boom', () => {
      throw new June15Error('conversation_not_found', 'no such convo');
    });
    app.onError(errorHandler());
    const res = await app.fetch(new Request('http://t/boom'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('conversation_not_found');
  });

  it('returns 429 on conversation_limit_reached', async () => {
    const app = new Hono();
    app.get('/boom', () => {
      throw new June15Error('conversation_limit_reached', 'too many');
    });
    app.onError(errorHandler());
    const res = await app.fetch(new Request('http://t/boom'));
    expect(res.status).toBe(429);
  });

  it('returns 500 generic message for unknown errors', async () => {
    const app = new Hono();
    app.get('/boom', () => {
      throw new Error('totally unexpected');
    });
    app.onError(errorHandler());
    const res = await app.fetch(new Request('http://t/boom'));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { code: string; message: string };
    expect(body.code).toBe('internal_error');
    expect(body.message).not.toContain('totally unexpected');
  });
});
