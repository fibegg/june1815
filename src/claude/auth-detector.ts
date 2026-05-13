import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type AuthSource =
  | 'env_oauth'
  | 'env_anthropic_key'
  | 'env_claude_key'
  | 'june15_token_file'
  | 'claude_credentials'
  | 'none';

export interface AuthInfo {
  readonly authenticated: boolean;
  readonly source: AuthSource;
  /** When source is an env var, the name of the env var. */
  readonly envKey?: string;
  /** When source is a file, the path of the file. */
  readonly path?: string;
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
