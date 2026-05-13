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
}

/**
 * Require `Authorization: Bearer <token>` on every request whose path is not
 * in `publicPaths`. Returns 401 on missing/mismatched tokens. Token compare
 * is constant-time.
 */
export function bearerAuthMiddleware(opts: BearerAuthOptions): MiddlewareHandler {
  const publicPaths = opts.publicPaths ?? [];
  return async (c, next) => {
    const path = c.req.path;
    if (publicPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next();
    }
    const header = c.req.header('authorization') ?? '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || !m[1] || !constantTimeEqual(m[1], opts.token)) {
      return c.json(
        { code: 'http_unauthorized', message: 'missing or invalid bearer token' },
        401,
      );
    }
    return next();
  };
}
