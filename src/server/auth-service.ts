import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { detectAuth, type AuthInfo, type AuthDetectorFs } from '../claude/auth-detector.js';

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
  writeFileSync: (p, d, o) => writeFileSync(p, d, o),
  rmSync: (p, o) => rmSync(p, o),
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
}

/**
 * Manages june15's own token file and answers "what's the current auth
 * source?" queries by delegating to `detectAuth`. Reading or modifying the
 * token never returns the token value to callers — the file is written and
 * subsequently consumed by spawned claude children via their env.
 */
export class AuthService {
  private readonly dataDir: string;
  private readonly homeDir: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fs: TokenStoreFs & AuthDetectorFs;

  constructor(opts: AuthServiceOptions) {
    this.dataDir = opts.dataDir;
    this.homeDir = opts.homeDir ?? homedir();
    this.env = opts.env ?? process.env;
    this.fs = opts.fs ?? realFs;
  }

  private tokenPath(): string {
    return join(this.dataDir, TOKEN_FILE);
  }

  status(): AuthInfo {
    return detectAuth({
      env: this.env,
      homeDir: this.homeDir,
      dataDir: this.dataDir,
      fs: this.fs,
    });
  }

  setToken(token: string): void {
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    }
    this.fs.writeFileSync(this.tokenPath(), token.trim(), { mode: 0o600 });
  }

  clear(): void {
    const p = this.tokenPath();
    if (this.fs.existsSync(p)) this.fs.rmSync(p, { force: true });
  }
}
