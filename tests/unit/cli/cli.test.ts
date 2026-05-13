import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../../../src/cli/cli.js';
import { ExitCode } from '../../../src/cli/exit-codes.js';
import { June15Error } from '../../../src/errors.js';
import { applyCommonOptions, commonOptionsToConfig } from '../../../src/cli/cli-options.js';

function ioForTesting() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exit: number[] = [];
  const io: CliIo = {
    stdout: (s) => stdout.push(s),
    stderr: (s) => stderr.push(s),
    exit: (code) => exit.push(code),
  };
  return { io, stdout, stderr, exit };
}

describe('runCli error translation', () => {
  it('maps June15Error config_invalid to ExitCode.BadInput', async () => {
    const { io, stderr, exit } = ioForTesting();
    await runCli(['node', 'june15', 'boom'], {
      version: '0.0.0',
      io,
      registrars: [
        (program) => {
          program.command('boom').action(() => {
            throw new June15Error('config_invalid', 'bad');
          });
        },
      ],
    });
    expect(exit).toContain(ExitCode.BadInput);
    expect(stderr.join('')).toContain('config_invalid');
  });

  it('maps claude_not_found to ExitCode.ClaudeNotFound', async () => {
    const { io, exit } = ioForTesting();
    await runCli(['node', 'june15', 'boom'], {
      version: '0.0.0',
      io,
      registrars: [
        (program) => {
          program.command('boom').action(() => {
            throw new June15Error('claude_not_found', 'no claude');
          });
        },
      ],
    });
    expect(exit).toContain(ExitCode.ClaudeNotFound);
  });

  it('maps non-June15 errors to ExitCode.Error', async () => {
    const { io, stderr, exit } = ioForTesting();
    await runCli(['node', 'june15', 'boom'], {
      version: '0.0.0',
      io,
      registrars: [
        (program) => {
          program.command('boom').action(() => {
            throw new Error('something else');
          });
        },
      ],
    });
    expect(exit).toContain(ExitCode.Error);
    expect(stderr.join('')).toContain('something else');
  });
});

describe('applyCommonOptions / commonOptionsToConfig', () => {
  it('--headless maps to mode=headless in partial config', () => {
    const partial = commonOptionsToConfig({ headless: true });
    expect(partial.mode).toBe('headless');
  });

  it('--interactive maps to mode=interactive', () => {
    const partial = commonOptionsToConfig({ interactive: true });
    expect(partial.mode).toBe('interactive');
  });

  it('--data-dir lands at dataDir', () => {
    const partial = commonOptionsToConfig({ dataDir: '/tmp/june15' });
    expect(partial.dataDir).toBe('/tmp/june15');
  });

  it('--log-level wraps under logger.level', () => {
    const partial = commonOptionsToConfig({ logLevel: 'debug' });
    expect(partial.logger?.level).toBe('debug');
  });

  it('refuses simultaneous --interactive and --headless', () => {
    const cmd = applyCommonOptions(new Command('t')).exitOverride();
    expect(() => cmd.parse(['node', 't', '--interactive', '--headless'])).toThrow();
  });
});
