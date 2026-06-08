import type { MiddlewareHandler } from 'hono';

/** Constant-time equality check to avoid timing side-channels on token compare. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface BearerAuthOptions {
  /** The required bearer token. */
  readonly token: string;
  /** Path prefixes that bypass the check (e.g. ['/healthz']). */
  readonly publicPaths?: readonly string[];
  /** Name of the HttpOnly cookie used to carry the token across asset
   *  fetches. Defaults to `june1815_token`. */
  readonly cookieName?: string;
  /** When true, omit the `Secure` flag on the cookie so it works over plain
   *  HTTP on localhost. Defaults to true (june1815 is usually bound to
   *  127.0.0.1). Production deployments behind TLS should set this false. */
  readonly cookieInsecure?: boolean;
  /** Cookie lifetime in seconds. Defaults to 12 hours. */
  readonly cookieMaxAgeSec?: number;
}

function parseCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const pairs = header.split(';');
  for (const raw of pairs) {
    const idx = raw.indexOf('=');
    if (idx < 0) continue;
    const k = raw.slice(0, idx).trim();
    if (k !== name) continue;
    const v = raw.slice(idx + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

/**
 * Require a valid bearer token, accepted in any of:
 *
 *   - `Authorization: Bearer <token>` header
 *   - `?token=<token>` query parameter
 *   - `Cookie: <cookieName>=<token>` (set by this middleware itself on the
 *     first successful header/query auth)
 *
 * Public paths (e.g. `/healthz`) skip the check entirely.
 *
 * The cookie path means a browser that loads the SPA via `?token=...` can
 * then fetch static assets (which can't easily carry an `Authorization`
 * header) over the same connection — without any client-side wiring.
 */
export function bearerAuthMiddleware(opts: BearerAuthOptions): MiddlewareHandler {
  const publicPaths = opts.publicPaths ?? [];
  const cookieName = opts.cookieName ?? 'june1815_token';
  const cookieMaxAge = opts.cookieMaxAgeSec ?? 12 * 60 * 60;
  const secureFlag = opts.cookieInsecure === true ? '' : '; Secure';

  return async (c, next) => {
    const path = c.req.path;
    if (publicPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next();
    }

    const header = c.req.header('authorization') ?? '';
    const headerMatch = /^Bearer\s+(.+)$/i.exec(header);
    let token: string | null = null;
    let source: 'header' | 'query' | 'cookie' | null = null;
    if (headerMatch?.[1]) {
      token = headerMatch[1];
      source = 'header';
    } else {
      const qToken = c.req.query('token');
      if (qToken && qToken.length > 0) {
        token = qToken;
        source = 'query';
      } else {
        const cookieToken = parseCookie(c.req.header('cookie'), cookieName);
        if (cookieToken) {
          token = cookieToken;
          source = 'cookie';
        }
      }
    }

    if (!token || !constantTimeEqual(token, opts.token)) {
      return c.json(
        { code: 'http_unauthorized', message: 'missing or invalid bearer token' },
        401,
      );
    }

    await next();

    // On a successful header/query auth via GET, plant a cookie so the
    // browser can continue fetching paired assets without re-presenting the
    // token. Skipped for cookie-sourced auths (already set) and non-GET
    // requests (API calls don't need it).
    if ((source === 'header' || source === 'query') && c.req.method === 'GET') {
      const cookieValue = encodeURIComponent(opts.token);
      c.header(
        'Set-Cookie',
        `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookieMaxAge}${secureFlag}`,
        { append: true },
      );
    }
  };
}
