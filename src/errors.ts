/**
 * Typed error hierarchy. Every thrown error in june1815 is one of these.
 * Code numbers are stable strings (not magic ints) so consumers can branch on
 * them without coupling to exception classes.
 */

export type June1815ErrorCode =
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

export class June1815Error extends Error {
  public override readonly name = 'June1815Error';
  public readonly code: June1815ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: June1815ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function isJune1815Error(e: unknown): e is June1815Error {
  return e instanceof June1815Error;
}
