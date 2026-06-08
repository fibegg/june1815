/**
 * The single source of truth for every environment variable june1815 recognizes.
 *
 * Each entry maps an ENV key to a YAML path (dot-separated, walks the
 * Config tree). The loader uses this list to construct a partial config
 * object from `process.env`; the `gen-env-example` script renders this list
 * into `.env.example` so the file never drifts from the runtime behavior.
 */

export type EnvKeyType = 'string' | 'number' | 'boolean';

export interface EnvKeyDef {
  /** ENV variable name. Conventionally JUNE1815_ prefix. */
  env: string;
  /** Dot-path into the Config tree (e.g. "server.port"). */
  yaml: string;
  /** Runtime type used by the loader when coercing the raw string value. */
  type: EnvKeyType;
  /** One-line description shown in `.env.example`. */
  description: string;
  /** Optional example value rendered in `.env.example`. */
  example?: string;
  /** Mark values that should be redacted in `config show` output. */
  secret?: boolean;
}

export const ENV_KEYS: readonly EnvKeyDef[] = Object.freeze([
  {
    env: 'JUNE1815_MODE',
    yaml: 'mode',
    type: 'string',
    description: 'UX mode: interactive (TTY prompts) or headless (no prompts).',
    example: 'interactive',
  },
  {
    env: 'JUNE1815_DATA_DIR',
    yaml: 'dataDir',
    type: 'string',
    description: 'Conversation state and session markers location.',
    example: '~/.local/share/june1815',
  },
  {
    env: 'JUNE1815_HOST',
    yaml: 'server.host',
    type: 'string',
    description: 'HTTP bind address. Use 0.0.0.0 to expose beyond localhost.',
    example: '127.0.0.1',
  },
  {
    env: 'JUNE1815_PORT',
    yaml: 'server.port',
    type: 'number',
    description: 'HTTP listen port.',
    example: '7150',
  },
  {
    env: 'JUNE1815_BEARER_TOKEN',
    yaml: 'server.auth.bearerToken',
    type: 'string',
    description:
      'Bearer token required on all /v1/* write endpoints. Auto-generated at first boot if unset.',
    example: 'replace-me-with-a-random-32-char-string',
    secret: true,
  },
  {
    env: 'JUNE1815_AUTO_INSTALL',
    yaml: 'claude.autoInstall',
    type: 'boolean',
    description: 'Permit headless installation of `claude` via `npm i -g @anthropic-ai/claude-code`.',
    example: 'false',
  },
  {
    env: 'JUNE1815_CLAUDE_PATH',
    yaml: 'claude.path',
    type: 'string',
    description: 'Explicit path to the `claude` executable. Overrides PATH lookup.',
    example: '/usr/local/bin/claude',
  },
  {
    env: 'JUNE1815_PTY_COLS',
    yaml: 'pty.cols',
    type: 'number',
    description: 'PTY width. Wider PTY reduces line-wrap noise in the TUI parser.',
    example: '200',
  },
  {
    env: 'JUNE1815_PTY_ROWS',
    yaml: 'pty.rows',
    type: 'number',
    description: 'PTY height. Tall enough to hold reasoning + tool blocks.',
    example: '50',
  },
  {
    env: 'JUNE1815_PTY_IDLE_QUIET_MS',
    yaml: 'pty.idleQuietMs',
    type: 'number',
    description: 'Quiet period in ms before the TUI parser snapshots the screen.',
    example: '10',
  },
  {
    env: 'JUNE1815_LOG_LEVEL',
    yaml: 'logger.level',
    type: 'string',
    description: 'pino log level: fatal | error | warn | info | debug | trace.',
    example: 'info',
  },
  {
    env: 'JUNE1815_LOG_PRETTY',
    yaml: 'logger.pretty',
    type: 'boolean',
    description: 'Force human-readable log output. Default: true in interactive mode.',
    example: 'true',
  },
  {
    env: 'JUNE1815_MAX_CONVERSATIONS',
    yaml: 'limits.maxConversations',
    type: 'number',
    description: 'Maximum concurrent conversations (each runs its own `claude` child).',
    example: '8',
  },
  {
    env: 'JUNE1815_UI_ENABLED',
    yaml: 'ui.enabled',
    type: 'boolean',
    description: 'Serve the bundled chat UI at `/`. Disabled by default.',
    example: 'false',
  },
  {
    env: 'JUNE1815_UI_DIST_DIR',
    yaml: 'ui.distDir',
    type: 'string',
    description: 'Override path to the built UI directory. Defaults to dist/ui inside the package.',
    example: '/opt/june1815/dist/ui',
  },
  {
    env: 'JUNE1815_UI_COOKIE_INSECURE',
    yaml: 'ui.cookieInsecure',
    type: 'boolean',
    description: 'Omit Secure flag on the auth cookie so it works over plain HTTP. Set false behind TLS.',
    example: 'true',
  },
] as const satisfies readonly EnvKeyDef[]);

/**
 * Helper that returns the EnvKeyDef whose `env` matches the supplied name,
 * or undefined if unknown. Used by `config show` to redact secrets and by
 * documentation tooling.
 */
export function findEnvKey(name: string): EnvKeyDef | undefined {
  return ENV_KEYS.find((k) => k.env === name);
}
