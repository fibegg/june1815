import { homedir, platform } from 'node:os';
import { Command } from 'commander';
import { applyCommonOptions, commonOptionsToConfig, type CommonOptionValues } from '../cli-options.js';
import type { CommandRegistrar } from '../cli.js';
import { loadConfig } from '../../config/loader.js';
import { detectAuth } from '../../claude/auth-detector.js';
import { locateClaude } from '../../claude/locator.js';
import { getClaudeVersion } from '../../claude/version.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

type DoctorOptions = CommonOptionValues;

type Status = 'ok' | 'warn' | 'error';

interface Check {
  readonly label: string;
  readonly value: string;
  readonly status: Status;
}

function tick(status: Status): string {
  switch (status) {
    case 'ok':
      return '[ok]';
    case 'warn':
      return '[warn]';
    case 'error':
      return '[error]';
  }
}

function format(checks: readonly Check[]): string {
  const width = Math.max(...checks.map((c) => c.label.length));
  return checks.map((c) => `${tick(c.status).padEnd(8)} ${c.label.padEnd(width + 2)} ${c.value}`).join('\n');
}

export const registerDoctor: CommandRegistrar = (program, io) => {
  const cmd = new Command('doctor').description('diagnose june15\'s runtime prerequisites').action(
    async (raw: DoctorOptions, command: Command) => {
      const common = (command.parent?.opts() ?? {});
      const cliPartial = commonOptionsToConfig({ ...common, ...raw });
      const config = loadConfig({ cliOverrides: cliPartial, env: process.env, homeDir: homedir() });

      const checks: Check[] = [];

      const pathVar = process.env.PATH;
      const locatorInput: Parameters<typeof locateClaude>[0] = { pathVar, home: homedir(), platform: platform() };
      if (config.claude.path) locatorInput.overridePath = config.claude.path;
      const loc = locateClaude(locatorInput);
      if (loc.found) {
        let versionStr = '';
        try {
          const v = await getClaudeVersion(loc.path);
          versionStr = v.semver ? ` (v${v.semver})` : ' (version unknown)';
        } catch {
          versionStr = ' (version probe failed)';
        }
        checks.push({ label: 'claude', value: `${loc.path}${versionStr}`, status: 'ok' });
      } else {
        checks.push({
          label: 'claude',
          value: `not found (searched ${loc.searched.length} locations)`,
          status: 'error',
        });
      }

      const auth = detectAuth({
        env: process.env,
        homeDir: homedir(),
        dataDir: config.dataDir ?? join(homedir(), '.local', 'share', 'june15'),
      });
      checks.push({
        label: 'auth source',
        value: auth.authenticated ? auth.source : 'none (run `claude auth login` or set CLAUDE_CODE_OAUTH_TOKEN)',
        status: auth.authenticated ? 'ok' : 'warn',
      });

      const dataDir = config.dataDir ?? join(homedir(), '.local', 'share', 'june15');
      checks.push({
        label: 'data dir',
        value: `${dataDir} (${existsSync(dataDir) ? 'exists' : 'will be created on first use'})`,
        status: 'ok',
      });

      checks.push({ label: 'pty cols/rows', value: `${config.pty.cols} x ${config.pty.rows}`, status: 'ok' });
      checks.push({
        label: 'max conversations',
        value: String(config.limits.maxConversations),
        status: 'ok',
      });
      checks.push({
        label: 'http bind',
        value: `${config.server.host}:${config.server.port}`,
        status: 'ok',
      });

      io.stdout(`${format(checks)}\n`);
      if (checks.some((c) => c.status === 'error')) io.exit(1);
    },
  );
  applyCommonOptions(cmd);
  program.addCommand(cmd);
};
