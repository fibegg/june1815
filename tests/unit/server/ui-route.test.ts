import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { registerUiRoutes, type UiFs } from '../../../src/server/routes/ui.js';
import type { AppEnv } from '../../../src/server/server.js';

function inMemoryFs(files: Record<string, string>): UiFs {
  return {
    existsSync: (p) => p in files,
    isFile: (p) => p in files,
    readFileSync: (p) => Buffer.from(files[p] ?? ''),
  };
}

describe('registerUiRoutes', () => {
  it('serves index.html at /', async () => {
    const app = new Hono<AppEnv>();
    const fs = inMemoryFs({ '/dist/ui/index.html': '<html>june15</html>' });
    registerUiRoutes(app, { distDir: '/dist/ui', fs });
    const res = await app.fetch(new Request('http://t/'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toBe('<html>june15</html>');
  });

  it('serves an asset at /assets/app.js with the right content type', async () => {
    const app = new Hono<AppEnv>();
    const fs = inMemoryFs({
      '/dist/ui/index.html': '<html></html>',
      '/dist/ui/assets/app.js': 'console.log("hi")',
    });
    registerUiRoutes(app, { distDir: '/dist/ui', fs });
    const res = await app.fetch(new Request('http://t/assets/app.js'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(await res.text()).toBe('console.log("hi")');
  });

  it('falls back to index.html for SPA routes', async () => {
    const app = new Hono<AppEnv>();
    const fs = inMemoryFs({ '/dist/ui/index.html': 'SPA' });
    registerUiRoutes(app, { distDir: '/dist/ui', fs });
    const res = await app.fetch(new Request('http://t/conversations/abc/messages'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('SPA');
  });

  it('returns 503 when index.html is missing', async () => {
    const app = new Hono<AppEnv>();
    const fs = inMemoryFs({});
    registerUiRoutes(app, { distDir: '/dist/ui', fs });
    const res = await app.fetch(new Request('http://t/'));
    expect(res.status).toBe(503);
  });

  it('blocks directory traversal', async () => {
    const app = new Hono<AppEnv>();
    const fs = inMemoryFs({
      '/dist/ui/index.html': 'safe',
      '/etc/passwd': 'secrets',
    });
    registerUiRoutes(app, { distDir: '/dist/ui', fs });
    const res = await app.fetch(new Request('http://t/../../etc/passwd'));
    // Either falls back to index.html (Hono normalizes leading dots in many
    // cases) or returns the index — what matters is NOT the secret file
    expect(await res.text()).not.toContain('secrets');
  });
});
