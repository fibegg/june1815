import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  detectAuth,
  probeClaudeAuthStatus,
  type AuthDetectorFs,
  type AuthInfo,
  type AuthProbeSpawnFacade,
} from '../claude/auth-detector.js';

export interface TokenStoreFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string, options?: { mode?: number }): void;
  rmSync(path: string, options: { force: boolean }): void;
  mkdirSync(path: string, options: { recursive: boolean; mode?: number }): void;
}

const realFs: TokenStoreFs = {
  existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
  writeFileSync: (p, d, o) => { writeFileSync(p, d, o); },
  rmSync: (p, o) => { rmSync(p, o); },
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  },
};

const TOKEN_FILE = 'agent_token.txt';

export interface AuthServiceOptions {
  readonly dataDir: string;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fs?: TokenStoreFs & AuthDetectorFs;
  /** Path to the resolved `claude` binary. When supplied, `status()`
   *  falls back to `claude auth status` if no local source is found. */
  readonly claudePath?: string;
  /** Override the auth probe spawn (tests). */
  readonly probeSpawn?: AuthProbeSpawnFacade;
}

/**
 * Manages june15's own token file and answers "what's the current auth
 * source?" queries.
 *
 * Resolution order:
 *   1. Local sources — env vars, june15 token file, ~/.claude/.credentials.json.
 *      Fast, no subprocess.
 *   2. `claude auth status` probe. Catches the case where claude stores
 *      credentials in the macOS Keychain or another OS-managed store
 *      that's invisible from the filesystem.
 *
 * Reading or modifying the token never returns the token value — the file
 * is written and subsequently consumed by spawned claude children.
 */
export class AuthService {
  private readonly dataDir: string;
  private readonly homeDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fs: TokenStoreFs & AuthDetectorFs;
  private readonly claudePath: string | undefined;
  private readonly probeSpawn: AuthProbeSpawnFacade | undefined;
  // Cache the probe result for a short window so the auth-status route
  // doesn't spawn claude on every poll.
  private probeCache: { at: number; info: AuthInfo } | null = null;
  private static readonly PROBE_TTL_MS = 5_000;

  constructor(opts: AuthServiceOptions) {
    this.dataDir = opts.dataDir;
    this.homeDir = opts.homeDir ?? homedir();
    this.env = opts.env ?? process.env;
    this.fs = opts.fs ?? realFs;
    this.claudePath = opts.claudePath;
    this.probeSpawn = opts.probeSpawn;
  }

  private tokenPath(): string {
    return join(this.dataDir, TOKEN_FILE);
  }

  /** Synchronous status — checks local sources only. Returns `none`
   *  when claude's OAuth credentials live somewhere `detectAuth` can't
   *  see (e.g. macOS Keychain). Prefer `status()` for the full answer. */
  statusLocal(): AuthInfo {
    return detectAuth({
      env: this.env,
      homeDir: this.homeDir,
      dataDir: this.dataDir,
      fs: this.fs,
    });
  }

  /**
   * Full status: local sources first; if none found, probe
   * `claude auth status` (cached briefly) so OS-keychain credentials are
   * detected too.
   */
  async status(): Promise<AuthInfo> {
    const local = this.statusLocal();
    if (local.authenticated) return local;
    if (!this.claudePath) return local;

    const now = Date.now();
    if (this.probeCache && now - this.probeCache.at < AuthService.PROBE_TTL_MS) {
      return this.probeCache.info;
    }

    let info: AuthInfo = local;
    try {
      const probe = this.probeSpawn
        ? await probeClaudeAuthStatus(this.claudePath, this.probeSpawn)
        : await probeClaudeAuthStatus(this.claudePath);
      if (probe.loggedIn) {
        const identity: NonNullable<AuthInfo['identity']> = {};
        if (probe.authMethod !== undefined) (identity as { authMethod?: string }).authMethod = probe.authMethod;
        if (probe.email !== undefined) (identity as { email?: string }).email = probe.email;
        if (probe.orgName !== undefined) (identity as { orgName?: string }).orgName = probe.orgName;
        if (probe.subscriptionType !== undefined)
          (identity as { subscriptionType?: string }).subscriptionType = probe.subscriptionType;
        const next: AuthInfo = { authenticated: true, source: 'claude_cli_session' };
        if (Object.keys(identity).length > 0) (next as { identity?: typeof identity }).identity = identity;
        info = next;
      }
    } catch {
      /* probe failure -> keep local result */
    }
    this.probeCache = { at: now, info };
    return info;
  }

  setToken(token: string): void {
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }
    this.fs.writeFileSync(this.tokenPath(), token.trim(), { mode: 0o600 });
    this.probeCache = null;
  }

  clear(): void {
    const p = this.tokenPath();
    if (this.fs.existsSync(p)) this.fs.rmSync(p, { force: true });
    this.probeCache = null;
  }
}
