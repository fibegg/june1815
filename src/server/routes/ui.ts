import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { Hono } from 'hono';
import type { AppEnv } from '../server.js';

export interface UiRouteDeps {
  /** Absolute path to the built UI directory (must contain index.html). */
  readonly distDir: string;
  /** Optional facade for tests. */
  readonly fs?: UiFs;
}

export interface UiFs {
  existsSync(path: string): boolean;
  readFileSync(path: string): Buffer;
  isFile(path: string): boolean;
}

const realFs: UiFs = {
  existsSync,
  readFileSync: (p) => readFileSync(p),
  isFile: (p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  },
};

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/** Resolve a request path to an absolute on-disk path inside `distDir`.
 *  Returns null if the resolved path would escape `distDir` (directory
 *  traversal protection). */
function resolveSafe(distDir: string, requestPath: string): string | null {
  const absRoot = resolve(distDir);
  // Strip leading slash so join() treats it as relative.
  const rel = requestPath.replace(/^\/+/, '');
  const candidate = normalize(join(absRoot, rel));
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : `${absRoot}${sep}`;
  if (candidate !== absRoot && !candidate.startsWith(rootWithSep)) return null;
  return candidate;
}

/**
 * Mount the bundled chat UI under `/`:
 *
 *   - `GET /` and any `GET /*` that resolves to an existing file in
 *     `distDir` returns that file with the appropriate Content-Type
 *   - Any other `GET /*` falls back to `index.html` (SPA routing).
 *
 * Directory traversal is blocked: a path that resolves outside `distDir`
 * returns 404 instead of leaking arbitrary host files.
 *
 * Bearer auth is enforced upstream by the global middleware — this route
 * sees only authenticated requests.
 */
export function registerUiRoutes(app: Hono<AppEnv>, deps: UiRouteDeps): void {
  const fs = deps.fs ?? realFs;
  const distDir = resolve(deps.distDir);
  const indexPath = join(distDir, 'index.html');

  if (!fs.existsSync(indexPath)) {
    app.get('/', (c) =>
      c.text(
        `june15 UI is enabled but index.html was not found under ${distDir}.\n` +
          'Run `npm run build:ui` (or set ui.distDir to your built directory).\n',
        503,
      ),
    );
    return;
  }

  app.get('*', (c) => {
    // Only handle GETs that fall through routes registered earlier — Hono
    // matches in registration order, so this lives at the tail.
    const reqPath = new URL(c.req.url).pathname;
    const resolved = resolveSafe(distDir, reqPath);
    if (resolved && resolved !== distDir && fs.isFile(resolved)) {
      const body = fs.readFileSync(resolved);
      return c.body(body as unknown as ArrayBuffer, 200, {
        'Content-Type': contentTypeFor(resolved),
        'Cache-Control': 'no-cache',
      });
    }
    // SPA fallback
    const index = fs.readFileSync(indexPath);
    return c.body(index as unknown as ArrayBuffer, 200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
    });
  });
}
