import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AuthSource =
  | 'env_oauth'
  | 'env_anthropic_key'
  | 'env_claude_key'
  | 'june15_token_file'
  | 'claude_credentials'
  | 'claude_cli_session'
  | 'none';

export interface AuthInfo {
  readonly authenticated: boolean;
  readonly source: AuthSource;
  /** When source is an env var, the name of the env var. */
  readonly envKey?: string;
  /** When source is a file, the path of the file. */
  readonly path?: string;
  /** Optional metadata surfaced when `source === 'claude_cli_session'`. */
  readonly identity?: {
    readonly email?: string;
    readonly orgName?: string;
    readonly subscriptionType?: string;
    readonly authMethod?: string;
  };
}

export interface AuthDetectorFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
}

const realFs: AuthDetectorFs = {
  existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
};

export interface AuthDetectorInput {
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to `os.homedir()`. */
  homeDir?: string;
  /** Where june15 stores its token file. Defaults to `<homeDir>/.local/share/june15`. */
  dataDir?: string;
  /** Filesystem facade — real fs by default. */
  fs?: AuthDetectorFs;
}

interface EnvCandidate {
  readonly key: string;
  readonly source: AuthSource;
}

const ENV_PRIORITY: readonly EnvCandidate[] = Object.freeze([
  { key: 'CLAUDE_CODE_OAUTH_TOKEN', source: 'env_oauth' },
  { key: 'ANTHROPIC_API_KEY', source: 'env_anthropic_key' },
  { key: 'CLAUDE_API_KEY', source: 'env_claude_key' },
]);

const JUNE15_TOKEN_FILE = 'agent_token.txt';
const CLAUDE_CREDENTIALS_REL = ['.claude', '.credentials.json'] as const;

/**
 * Resolve which authentication source june15 should advertise to the user
 * and downstream consumers. The precedence (high to low):
 *
 *   1. CLAUDE_CODE_OAUTH_TOKEN  (env)  — preferred OAuth token
 *   2. ANTHROPIC_API_KEY        (env)
 *   3. CLAUDE_API_KEY           (env)
 *   4. <dataDir>/agent_token.txt — june15's own token file
 *   5. ~/.claude/.credentials.json — Claude CLI's own credential store
 *   6. none
 *
 * For env vars, presence with non-empty value is sufficient. For files, the
 * file must exist and contain non-whitespace content.
 *
 * Importantly, this function does NOT return the token value — only the
 * source. Tokens never leave their storage; spawned claude processes inherit
 * env or read the file themselves.
 */
export function detectAuth(input: AuthDetectorInput = {}): AuthInfo {
  const env = input.env ?? process.env;
  const home = input.homeDir ?? homedir();
  const dataDir = input.dataDir ?? join(home, '.local', 'share', 'june15');
  const fs = input.fs ?? realFs;

  for (const c of ENV_PRIORITY) {
    const v = env[c.key];
    if (v && v.trim().length > 0) {
      return { authenticated: true, source: c.source, envKey: c.key };
    }
  }

  const tokenPath = join(dataDir, JUNE15_TOKEN_FILE);
  if (fs.existsSync(tokenPath)) {
    try {
      if (fs.readFileSync(tokenPath, 'utf8').trim().length > 0) {
        return { authenticated: true, source: 'june15_token_file', path: tokenPath };
      }
    } catch {
      /* unreadable — fall through */
    }
  }

  const claudeCredsPath = join(home, ...CLAUDE_CREDENTIALS_REL);
  if (fs.existsSync(claudeCredsPath)) {
    return { authenticated: true, source: 'claude_credentials', path: claudeCredsPath };
  }

  return { authenticated: false, source: 'none' };
}

/** Spawn facade for the `claude auth status` probe (tests pass a fake). */
export interface AuthProbeSpawnFacade {
  run(
    command: string,
    args: readonly string[],
    timeoutMs: number,
  ): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }>;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*\x07|[78=>]|\([AB012])/g;

const realProbeSpawn: AuthProbeSpawnFacade = {
  run: (cmd, args, timeoutMs) =>
    new Promise((resolve) => {
      const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMs);
      timer.unref?.();
      child.stdout.on('data', (c: Buffer | string) => {
        stdout += c.toString();
      });
      child.stderr.on('data', (c: Buffer | string) => {
        stderr += c.toString();
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? 1, stdout, stderr });
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: err.message });
      });
    }),
};

export interface ProbeResult {
  readonly loggedIn: boolean;
  readonly authMethod?: string;
  readonly email?: string;
  readonly orgName?: string;
  readonly subscriptionType?: string;
}

/** Parse `claude auth status` stdout (ANSI-tolerant) into a structured
 *  result. Recent Claude CLI versions emit a JSON blob with at least a
 *  `loggedIn` boolean and an `authMethod` string. */
export function parseClaudeAuthStatus(stdout: string): ProbeResult {
  const cleaned = stdout.replace(ANSI_RE, '').replace(/\r/g, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return { loggedIn: false };
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      loggedIn?: unknown;
      authMethod?: unknown;
      email?: unknown;
      orgName?: unknown;
      subscriptionType?: unknown;
    };
    const loggedIn = parsed.loggedIn === true;
    const out: ProbeResult = { loggedIn };
    if (typeof parsed.authMethod === 'string') (out as { authMethod?: string }).authMethod = parsed.authMethod;
    if (typeof parsed.email === 'string') (out as { email?: string }).email = parsed.email;
    if (typeof parsed.orgName === 'string') (out as { orgName?: string }).orgName = parsed.orgName;
    if (typeof parsed.subscriptionType === 'string')
      (out as { subscriptionType?: string }).subscriptionType = parsed.subscriptionType;
    return out;
  } catch {
    return { loggedIn: false };
  }
}

/**
 * Run `<claudePath> auth status` and parse the JSON result. This is the
 * authoritative source on macOS where claude stores its OAuth credentials
 * in the Keychain rather than on disk — `detectAuth` can't see those.
 *
 * Timeouts default to 5s. Failures (non-zero exit, bad JSON, no `claude`
 * on PATH) collapse to `{ loggedIn: false }` so the caller can use this
 * as one signal among several.
 */
export async function probeClaudeAuthStatus(
  claudePath: string,
  spawnFacade: AuthProbeSpawnFacade = realProbeSpawn,
  timeoutMs = 5_000,
): Promise<ProbeResult> {
  const r = await spawnFacade.run(claudePath, ['auth', 'status'], timeoutMs);
  if (r.code !== 0) return { loggedIn: false };
  return parseClaudeAuthStatus(r.stdout);
}
