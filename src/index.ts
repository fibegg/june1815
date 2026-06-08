/**
 * Public library entry. Consumers who embed june1815 in their own process
 * (rather than as a CLI) import from here.
 *
 * The CLI lives at `june1815/dist/cli/bin.js` and is published as the `june1815`
 * bin entry; you don't normally import it.
 *
 * Event schemas are also published under the subpath `june1815/events` so
 * consumers can type-check SSE payloads without depending on internals.
 */

export type { Config, Mode } from './config/schema.js';
export { ConfigSchema } from './config/schema.js';
export { loadConfig } from './config/loader.js';
export { ENV_KEYS, findEnvKey } from './config/env-keys.js';

export { createLogger, loggerOptionsFromConfig } from './logger.js';
export type { Logger, LoggerOptions } from './logger.js';

export { locateClaude, enrichedPath } from './claude/locator.js';
export type { LocatorResult, LocatorSource } from './claude/locator.js';
export { detectAuth } from './claude/auth-detector.js';
export type { AuthInfo, AuthSource } from './claude/auth-detector.js';
export { installClaude, installOrThrow } from './claude/installer.js';
export { parseClaudeVersion, getClaudeVersion } from './claude/version.js';

export { Conversation } from './conversation/conversation.js';
export type { ConversationEvent, ConversationState } from './conversation/conversation.js';
export { ConversationManager } from './conversation/manager.js';
export { MessageQueue } from './conversation/queue.js';
export { SessionMarkerStore } from './conversation/session-marker.js';
export { ProductionConversationFactory } from './conversation/factory.js';

export { createServer } from './server/server.js';
export { AuthService } from './server/auth-service.js';
export { registerHealthRoute } from './server/routes/health.js';
export { registerAuthRoutes } from './server/routes/auth.js';
export { registerConversationRoutes } from './server/routes/conversations.js';
export { registerMessageRoutes } from './server/routes/messages.js';

export { June1815Error, isJune1815Error } from './errors.js';
export type { June1815ErrorCode } from './errors.js';
