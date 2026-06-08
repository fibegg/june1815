import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SessionMarkerFs {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
  writeFileSync(path: string, data: string): void;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  rmSync(path: string, options: { force: boolean }): void;
}

const realFs: SessionMarkerFs = {
  existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
  writeFileSync: (p, d) => { writeFileSync(p, d); },
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  },
  rmSync: (p, o) => { rmSync(p, o); },
};

const MARKER_FILE = 'session.txt';

/**
 * Persists each conversation's Claude-side `session_id` to disk so a
 * conversation can be resumed across june1815 restarts via `claude --resume`
 * or `--session-id`.
 *
 * Layout: `<dataDir>/conversations/<conversationId>/session.txt`.
 */
export class SessionMarkerStore {
  constructor(
    private readonly dataDir: string,
    private readonly fs: SessionMarkerFs = realFs,
  ) {}

  private dirFor(conversationId: string): string {
    return join(this.dataDir, 'conversations', conversationId);
  }

  pathFor(conversationId: string): string {
    return join(this.dirFor(conversationId), MARKER_FILE);
  }

  read(conversationId: string): string | null {
    const p = this.pathFor(conversationId);
    if (!this.fs.existsSync(p)) return null;
    try {
      const v = this.fs.readFileSync(p, 'utf8').trim();
      return v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }

  write(conversationId: string, sessionId: string): void {
    const dir = this.dirFor(conversationId);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(this.pathFor(conversationId), sessionId.trim());
  }

  delete(conversationId: string): void {
    const p = this.pathFor(conversationId);
    if (!this.fs.existsSync(p)) return;
    this.fs.rmSync(p, { force: true });
  }
}
