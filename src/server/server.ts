import { Hono } from 'hono';
import type { Logger } from '../logger.js';
import type { ConversationManager } from '../conversation/manager.js';
import { bearerAuthMiddleware } from './middleware/bearer-auth.js';
import { errorHandler } from './middleware/error.js';
import { requestIdMiddleware } from './middleware/request-id.js';

/** Public surface of the assembled HTTP app. */
export interface ServerApp {
  /** The Hono instance — call `fetch(request)` from tests, or hand to a
   *  Node adapter (`@hono/node-server`) for real serving. */
  readonly app: Hono<AppEnv>;
  /** The bearer token currently enforced. Returned so the CLI can print it
   *  in the boot message. */
  readonly bearerToken: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
  };
}

export interface AppDependencies {
  /** Logger; receives access logs, errors, etc. */
  readonly log: Logger;
  /** The bearer token enforced on every route except `publicPaths`. */
  readonly bearerToken: string;
  /** Conversation manager used by message/conversation routes (wired in
   *  subsequent commits). */
  readonly conversations: ConversationManager;
  /** Paths that bypass the bearer check entirely. Defaults to ['/healthz']. */
  readonly publicPaths?: readonly string[];
  /** When true (default), the auth cookie omits the Secure flag so it
   *  works over plain HTTP on localhost. Set false behind TLS. */
  readonly cookieInsecure?: boolean;
}

const DEFAULT_PUBLIC_PATHS: readonly string[] = Object.freeze(['/healthz']);

/**
 * Construct the Hono app with the standard middleware stack. Bearer auth
 * is applied globally (covers both the API and any future static UI),
 * with `publicPaths` carving out unauthenticated routes like `/healthz`.
 *
 * Routes are registered by later commits via the `registerXRoutes(app,
 * deps)` helpers exported alongside this factory.
 */
export function createServer(deps: AppDependencies): ServerApp {
  const app = new Hono<AppEnv>();
  app.use('*', requestIdMiddleware());
  app.use(
    '*',
    bearerAuthMiddleware({
      token: deps.bearerToken,
      publicPaths: deps.publicPaths ?? DEFAULT_PUBLIC_PATHS,
      cookieInsecure: deps.cookieInsecure ?? true,
    }),
  );
  app.onError(errorHandler(deps.log));
  return { app, bearerToken: deps.bearerToken };
}
