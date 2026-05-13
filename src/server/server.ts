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
  /** The bearer token enforced on /v1/* routes. */
  readonly bearerToken: string;
  /** Conversation manager used by message/conversation routes (wired in
   *  subsequent commits). */
  readonly conversations: ConversationManager;
}

/**
 * Construct the Hono app with the standard middleware stack. Routes are
 * registered by later commits via the `registerXRoutes(app, deps)` helpers
 * exported alongside this factory.
 */
export function createServer(deps: AppDependencies): ServerApp {
  const app = new Hono<AppEnv>();
  app.use('*', requestIdMiddleware());
  app.use('/v1/*', bearerAuthMiddleware({ token: deps.bearerToken }));
  app.onError(errorHandler(deps.log));
  return { app, bearerToken: deps.bearerToken };
}
