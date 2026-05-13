import { spawn } from 'node:child_process';

export interface VersionInfo {
  readonly raw: string;
  readonly semver: string | null;
  readonly parts: { major: number; minor: number; patch: number } | null;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const SEMVER_RE = /\b(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.+-]+)?\b/;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/**
 * Extract a semver from arbitrary `claude --version` output. Tolerates ANSI
 * escape sequences and surrounding chrome — looks for the first
 * X.Y.Z pattern.
 */
export function parseClaudeVersion(stdout: string): VersionInfo {
  const cleaned = stripAnsi(stdout).trim();
  const m = SEMVER_RE.exec(cleaned);
  if (!m?.[1] || !m[2] || !m[3]) {
    return { raw: cleaned, semver: null, parts: null };
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  return {
    raw: cleaned,
    semver: `${major}.${minor}.${patch}`,
    parts: { major, minor, patch },
  };
}

/** Spawn facade for testability. */
export interface VersionSpawnFacade {
  run(
    command: string,
    args: readonly string[],
  ): Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }>;
}

const realSpawn: VersionSpawnFacade = {
  run: (cmd, args) =>
    new Promise((resolve) => {
      const child = spawn(cmd, args as string[], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (c: Buffer | string) => {
        stdout += c.toString();
      });
      child.stderr.on('data', (c: Buffer | string) => {
        stderr += c.toString();
      });
      child.on('close', (code) => { resolve({ code: code ?? 1, stdout, stderr }); });
      child.on('error', (err) => { resolve({ code: -1, stdout, stderr: err.message }); });
    }),
};

/** Run `<claudePath> --version` and parse the result. */
export async function getClaudeVersion(
  claudePath: string,
  spawnFacade: VersionSpawnFacade = realSpawn,
): Promise<VersionInfo> {
  const r = await spawnFacade.run(claudePath, ['--version']);
  if (r.code !== 0) {
    return { raw: r.stderr.trim() || r.stdout.trim(), semver: null, parts: null };
  }
  return parseClaudeVersion(r.stdout);
}
