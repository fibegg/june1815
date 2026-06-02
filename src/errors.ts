/**
 * Typed error hierarchy. Every thrown error in june15 is one of these.
 * Code numbers are stable strings (not magic ints) so consumers can branch on
 * them without coupling to exception classes.
 */

export type June15ErrorCode =
  | 'config_invalid'
  | 'config_yaml_parse'
  | 'config_yaml_read'
  | 'claude_not_found'
  | 'claude_install_declined'
  | 'claude_install_failed'
  | 'claude_onboarding_required'
  | 'auth_unavailable'
  | 'pty_spawn_failed'
  | 'pty_dead'
  | 'conversation_not_found'
  | 'conversation_busy'
  | 'conversation_limit_reached'
  | 'http_bad_request'
  | 'http_unauthorized'
  | 'shim_no_claude_path'
  | 'shim_bad_input'
  | 'tool_defs_invalid';

export class June15Error extends Error {
  public override readonly name = 'June15Error';
  public readonly code: June15ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: June15ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isJune15Error(e: unknown): e is June15Error {
  return e instanceof June15Error;
}
