import type { ErrorHandler } from 'hono';
import { isJune1815Error, type June1815ErrorCode } from '../../errors.js';

const STATUS_FOR_CODE: Record<June1815ErrorCode, number> = {
  config_invalid: 400,
  config_yaml_parse: 400,
  config_yaml_read: 500,
  claude_not_found: 503,
  claude_install_declined: 503,
  claude_install_failed: 503,
  auth_unavailable: 401,
  pty_spawn_failed: 500,
  pty_dead: 410,
  conversation_not_found: 404,
  conversation_busy: 409,
  conversation_limit_reached: 429,
  http_bad_request: 400,
  http_unauthorized: 401,
  // These codes only fire from CLI modes (the stream-json shim, tool-defs
  // loader) or the conversation startup path. They never reach the HTTP
  // error handler, but they're listed here to keep the union exhaustive.
  shim_no_claude_path: 503,
  shim_bad_input: 400,
  tool_defs_invalid: 400,
  claude_onboarding_required: 503,
};

/**
 * Catch-all error handler. Maps `June1815Error` codes to HTTP status codes and
 * emits a stable JSON envelope. Unknown errors become 500 with a generic
 * message — the actual error message is logged but not leaked to clients.
 */
export function errorHandler(log?: { error(err: unknown, msg: string): void }): ErrorHandler {
  return (err, c) => {
    if (isJune1815Error(err)) {
      const status = STATUS_FOR_CODE[err.code];
      return c.json(
        { code: err.code, message: err.message, details: err.details },
        status as 400 | 401 | 404 | 409 | 410 | 429 | 500 | 503,
      );
    }
    log?.error(err, 'unhandled error');
    return c.json(
      { code: 'internal_error', message: 'internal server error' },
      500,
    );
  };
}
