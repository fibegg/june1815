import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface SpawnedServer {
  readonly url: string;
  readonly bearerToken: string;
  readonly dataDir: string;
  stop(): Promise<void>;
}

export interface SpawnOptions {
  /** Override the port. Default: ephemeral (0 -> let the OS pick). */
  readonly port?: number;
  /** Additional env passed to the child. Inherits process.env by default. */
  readonly env?: NodeJS.ProcessEnv;
  /** Override the path to dist/cli/bin.js. Default: `<repo>/dist/cli/bin.js`. */
  readonly binPath?: string;
}

const BOOT_TIMEOUT_MS = 30_000;

function repoRoot(): string {
  // `tests/e2e/helpers/spawn-server.ts` -> three levels up.
  return resolve(new URL('.', import.meta.url).pathname, '..', '..', '..');
}

/**
 * Spawn `node dist/cli/bin.js gogogo --headless ...` as a child, wait for
 * the JSON boot line `{url, token}` on stdout, and return a handle that
 * lets the caller drive HTTP and tear the child down.
 *
 * The data dir is a fresh `mkdtemp` so tests don't see each other's
 * conversations.
 */
export async function spawnGogogo(opts: SpawnOptions = {}): Promise<SpawnedServer> {
  const root = repoRoot();
  const binPath = opts.binPath ?? join(root, 'dist', 'cli', 'bin.js');
  if (!existsSync(binPath)) {
    throw new Error(`built CLI not found at ${binPath}; run \`npm run build:server\` first`);
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'june15-e2e-'));
  const port = opts.port ?? 0;
  const args = [
    binPath,
    'gogogo',
    '--headless',
    '--port',
    String(port),
    '--data-dir',
    dataDir,
  ];

  const env: NodeJS.ProcessEnv = {
    ...(opts.env ?? process.env),
    JUNE15_MODE: 'headless',
    // Quieten the child's logs unless the test explicitly turns them up.
    JUNE15_LOG_LEVEL: process.env.JUNE15_E2E_LOG_LEVEL ?? 'warn',
  };

  const child = spawn(process.execPath, args, {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdoutBuf = '';
  let stderrBuf = '';

  const ready = new Promise<{ url: string; token: string }>((resolveReady, rejectReady) => {
    const onStdout = (chunk: Buffer | string): void => {
      stdoutBuf += chunk.toString();
      // The headless boot prints a single JSON line `{"url":...,"token":...}`.
      const lineEnd = stdoutBuf.indexOf('\n');
      if (lineEnd < 0) return;
      const firstLine = stdoutBuf.slice(0, lineEnd).trim();
      if (firstLine.startsWith('{')) {
        try {
          const parsed = JSON.parse(firstLine) as { url: string; token: string };
          if (parsed.url && parsed.token) {
            resolveReady({ url: parsed.url, token: parsed.token });
            return;
          }
        } catch {
          /* keep reading */
        }
      }
    };
    child.stdout!.on('data', onStdout);
    child.stderr!.on('data', (chunk: Buffer | string) => {
      stderrBuf += chunk.toString();
    });
    child.on('exit', (code, signal) => {
      rejectReady(
        new Error(
          `gogogo exited before ready (code=${code} signal=${signal})\n` +
            `stdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
        ),
      );
    });
    child.on('error', (err) => {
      rejectReady(err);
    });
    setTimeout(() => {
      rejectReady(
        new Error(
          `gogogo did not become ready within ${BOOT_TIMEOUT_MS}ms\n` +
            `stdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`,
        ),
      );
    }, BOOT_TIMEOUT_MS).unref();
  });

  const { url, token } = await ready;

  return {
    url,
    bearerToken: token,
    dataDir,
    stop: () => stopChild(child, dataDir),
  };
}

async function stopChild(child: ChildProcess, dataDir: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      child.on('exit', done);
      setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
        resolve();
      }, 5_000).unref();
    });
  }
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}
