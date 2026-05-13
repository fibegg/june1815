import { Command } from 'commander';
import { ExitCode } from './exit-codes.js';
import { isJune15Error, type June15ErrorCode } from '../errors.js';

const EXIT_CODE_FOR_ERROR: Partial<Record<June15ErrorCode, number>> = {
  config_invalid: ExitCode.BadInput,
  config_yaml_parse: ExitCode.BadInput,
  config_yaml_read: ExitCode.BadInput,
  claude_not_found: ExitCode.ClaudeNotFound,
  claude_install_declined: ExitCode.ClaudeNotFound,
  claude_install_failed: ExitCode.ClaudeInstallFailed,
  auth_unavailable: ExitCode.AuthUnavailable,
  pty_spawn_failed: ExitCode.PtyUnavailable,
  pty_dead: ExitCode.PtyUnavailable,
  http_bad_request: ExitCode.BadInput,
  http_unauthorized: ExitCode.AuthUnavailable,
};

/** Output / error sinks. Tests inject a recorder; production uses
 *  process.stdout / stderr. */
export interface CliIo {
  stdout(s: string): void;
  stderr(s: string): void;
  exit(code: number): void;
}

const realIo: CliIo = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  exit: (code) => {
    process.exit(code);
  },
};

export type CommandRegistrar = (program: Command, io: CliIo) => void;

export interface RunCliOptions {
  /** Commander command registrars. Each one calls program.addCommand(...). */
  registrars: readonly CommandRegistrar[];
  /** IO sinks; defaults to process.{stdout,stderr,exit}. */
  io?: CliIo;
  /** Package version string. */
  version: string;
}

/** Parse argv and dispatch to the matching command. Translates thrown
 *  `June15Error` values to stable process exit codes. */
export async function runCli(argv: readonly string[], opts: RunCliOptions): Promise<void> {
  const io = opts.io ?? realIo;
  const program = new Command();
  program
    .name('june15')
    .description('Wrap the Claude CLI TUI via PTY and expose it as an HTTP app-server.')
    .version(opts.version, '-v, --version', 'output the package version')
    .showHelpAfterError()
    .exitOverride((err) => {
      // commander throws its own CommanderError; rewrap to our exit code.
      const code = err.exitCode === 0 ? ExitCode.Ok : ExitCode.BadInput;
      io.exit(code);
    });

  for (const registrar of opts.registrars) registrar(program, io);

  try {
    await program.parseAsync(argv as string[]);
  } catch (err) {
    if (isJune15Error(err)) {
      const code = EXIT_CODE_FOR_ERROR[err.code] ?? ExitCode.Error;
      io.stderr(`error [${err.code}]: ${err.message}\n`);
      io.exit(code);
      return;
    }
    io.stderr(`error: ${(err as Error).message ?? String(err)}\n`);
    io.exit(ExitCode.Error);
  }
}
