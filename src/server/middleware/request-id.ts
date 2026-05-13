import { randomUUID } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';

const HEADER = 'x-request-id';

/**
 * Attach a request id to every request. Uses the incoming `x-request-id`
 * header if present (so clients can correlate); otherwise generates a UUID.
 * The id is exposed on `c.var.requestId` and echoed in the response header.
 */
export function requestIdMiddleware(): MiddlewareHandler<{
  Variables: { requestId: string };
}> {
  return async (c, next) => {
    const incoming = c.req.header(HEADER);
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    c.set('requestId', requestId);
    await next();
    c.header(HEADER, requestId);
  };
}
