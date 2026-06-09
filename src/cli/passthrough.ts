import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * june1815 is a drop-in for `claude` only on the stream-JSON query path (the
 * shim) and for its own subcommands (`gogogo`, `doctor`, `config`). Any
 * OTHER claude invocation a tool might make — `claude auth status`,
 * `claude auth logout`, `claude mcp …`, `claude update`, … — must be
 * forwarded verbatim to the real binary, or callers (e.g. the Claude
 * Agent SDK / fibe-agent, which run `claude auth status` to gate requests)
 * break with "unknown command". This module provides that passthrough.
 */

const JUNE1815_COMMANDS = new Set(['gogogo', 'doctor', 'config']);

/** True when argv targets june1815's own CLI (a known command, or only
 *  flags like `--version` / `-h`, or no args at all) rather than a claude
 *  subcommand that should be passed through. */
export function isJune1815Command(argv: readonly string[]): boolean {
  if (argv.length === 0) return true;
  const firstPositional = argv.find((a) => !a.startsWith('-'));
  if (firstPositional === undefined) return true; // flags only -> june1815 help/version
  return JUNE1815_COMMANDS.has(firstPositional);
}

/** Resolve the wrapped `claude` binary: `JUNE1815_CLAUDE_PATH` first, then a
 *  PATH lookup. Returns null when neither yields an existing file. */
export function resolveWrappedClaude(env: NodeJS.ProcessEnv): string | null {
  const override = env.JUNE1815_CLAUDE_PATH?.trim();
  if (override && existsSync(override)) return override;
  try {
    const found = execSync('command -v claude', { encoding: 'utf8', env }).trim();
    if (found && existsSync(found)) return found;
  } catch {
    /* not on PATH */
  }
  return null;
}

/** Exec the real `claude` with `argv`, inheriting stdio so the parent
 *  process (and anything reading june1815's stdio) sees claude's output
 *  unchanged. Resolves to the child's exit code. */
export function passthroughToClaude(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const claude = resolveWrappedClaude(env);
  if (!claude) {
    process.stderr.write(
      'june1815: cannot pass through to claude - set JUNE1815_CLAUDE_PATH or put claude on PATH\n',
    );
    return Promise.resolve(127);
  }
  return new Promise<number>((resolve) => {
    const child = spawn(claude, [...argv], { stdio: 'inherit', env });
    child.on('exit', (code, signal) => {
      resolve(signal ? 1 : (code ?? 0));
    });
    child.on('error', (err) => {
      process.stderr.write(`june1815: passthrough failed: ${err.message}\n`);
      resolve(127);
    });
  });
}
