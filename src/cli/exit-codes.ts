/**
 * Stable process exit codes used by the CLI.
 *
 * These are public — automation tools branch on them. Adding or removing a
 * code is a breaking change; gaps between numbers are intentional headroom
 * for future codes within the same category.
 */
export const ExitCode = Object.freeze({
  /** Normal successful exit. */
  Ok: 0,
  /** Generic / uncategorized error. */
  Error: 1,
  /** Caller-supplied input was invalid (bad flag, bad config). */
  BadInput: 2,

  /** `claude` is not on PATH and the user/runtime declined install. */
  ClaudeNotFound: 10,
  /** Install of claude was attempted but failed. */
  ClaudeInstallFailed: 11,

  /** No authentication source could be resolved. */
  AuthUnavailable: 20,

  /** Failed to bind the HTTP listener. */
  ServerBindFailed: 30,
  /** PTY subsystem failed catastrophically (e.g. node-pty unloadable). */
  PtyUnavailable: 31,

  /** SIGINT (user pressed Ctrl-C). */
  Interrupted: 130,
} as const);

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
