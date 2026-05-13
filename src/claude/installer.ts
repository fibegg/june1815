import { spawn } from 'node:child_process';
import { June15Error } from '../errors.js';
import type { Mode } from '../config/schema.js';

/** Outcome of an install attempt. */
export type InstallResult =
  | { readonly installed: true; readonly command: string }
  | {
      readonly installed: false;
      readonly reason: 'declined' | 'headless_no_consent' | 'spawn_failed';
      readonly details?: string;
    };

/** Minimal logger surface the installer needs. */
export interface InstallerLog {
  info(message: string): void;
  warn(message: string): void;
}

/** Async confirmation prompt — supplied by the CLI layer (`@clack/prompts`). */
export interface ConfirmPrompt {
  confirm(message: string): Promise<boolean>;
}

/** Spawn facade for testability. Returns the exit code; stderr is logged inline. */
export interface SpawnFacade {
  run(
    command: string,
    args: readonly string[],
  ): Promise<{ readonly code: number; readonly stderr: string }>;
}

const realSpawn: SpawnFacade = {
  run: (cmd, args) =>
    new Promise((resolve) => {
      const child = spawn(cmd, args as string[], { stdio: ['ignore', 'inherit', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });
      child.on('close', (code) => { resolve({ code: code ?? 1, stderr }); });
      child.on('error', (err) => { resolve({ code: -1, stderr: err.message }); });
    }),
};

export interface InstallInput {
  /** Resolved interactive/headless mode. */
  mode: Mode;
  /** When true, headless mode is allowed to install without a prompt. */
  autoInstall: boolean;
  /** Override the spawn implementation (tests). */
  spawnFacade?: SpawnFacade;
  /** Override the confirm prompt (tests / non-clack consumers). */
  prompt?: ConfirmPrompt;
  /** Logger; defaults to console.warn/console.error if absent. */
  log?: InstallerLog;
  /** Override the install command + args (tests). */
  command?: { cmd: string; args: readonly string[] };
}

const DEFAULT_INSTALL_CMD = 'npm';
const DEFAULT_INSTALL_ARGS = ['i', '-g', '@anthropic-ai/claude-code'] as const;

/**
 * Attempt to install the official `claude` CLI via `npm i -g
 * @anthropic-ai/claude-code`.
 *
 * Decision tree:
 *   headless + !autoInstall  -> refuse (`headless_no_consent`)
 *   headless +  autoInstall  -> run the install
 *   interactive              -> prompt the user; install on yes, decline on no
 *
 * On spawn failure or non-zero exit, returns `{ installed: false, reason:
 * 'spawn_failed' }` with the captured stderr in `details`. The caller is
 * expected to surface a human-readable message and re-run `locateClaude`
 * if `installed: true`.
 */
export async function installClaude(input: InstallInput): Promise<InstallResult> {
  const spawnFacade = input.spawnFacade ?? realSpawn;
  const cmd = input.command?.cmd ?? DEFAULT_INSTALL_CMD;
  const args = input.command?.args ?? DEFAULT_INSTALL_ARGS;
  const display = `${cmd} ${args.join(' ')}`;

  if (input.mode === 'headless' && !input.autoInstall) {
    input.log?.warn(
      "`claude` not found and headless mode forbids unattended install. " +
        'Set JUNE15_AUTO_INSTALL=1 or pass --auto-install to permit it, ' +
        `or run \`${display}\` manually.`,
    );
    return { installed: false, reason: 'headless_no_consent' };
  }

  if (input.mode === 'interactive') {
    if (!input.prompt) {
      // No prompt facility supplied — refuse rather than silently installing.
      input.log?.warn('interactive install requested but no prompt facility provided');
      return { installed: false, reason: 'declined' };
    }
    const ok = await input.prompt.confirm(
      `\`claude\` is not installed. Install it with \`${display}\`? (recommended)`,
    );
    if (!ok) return { installed: false, reason: 'declined' };
  }

  input.log?.info(`installing claude: ${display}`);
  const result = await spawnFacade.run(cmd, args);
  if (result.code !== 0) {
    return {
      installed: false,
      reason: 'spawn_failed',
      ...(result.stderr ? { details: result.stderr } : {}),
    };
  }
  return { installed: true, command: display };
}

/** Convenience wrapper that throws `June15Error` for non-installed outcomes. */
export async function installOrThrow(input: InstallInput): Promise<void> {
  const r = await installClaude(input);
  if (r.installed) return;
  switch (r.reason) {
    case 'declined':
      throw new June15Error('claude_install_declined', 'user declined to install claude');
    case 'headless_no_consent':
      throw new June15Error(
        'claude_install_declined',
        'headless mode cannot install claude without --auto-install / JUNE15_AUTO_INSTALL=1',
      );
    case 'spawn_failed':
      throw new June15Error(
        'claude_install_failed',
        `claude install failed: ${r.details ?? '(no stderr)'}`,
      );
  }
}
