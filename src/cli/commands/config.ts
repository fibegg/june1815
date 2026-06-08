import { homedir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import { applyCommonOptions, commonOptionsToConfig, type CommonOptionValues } from '../cli-options.js';
import type { CommandRegistrar } from '../cli.js';
import { loadConfig } from '../../config/loader.js';
import type { Config } from '../../config/schema.js';

const SECRET_PATHS: ReadonlySet<string> = new Set(['server.auth.bearerToken']);

function redact(config: Config): Record<string, unknown> {
  return walk(config, '');
}

function walk(obj: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (SECRET_PATHS.has(path)) {
      out[k] = v === undefined ? undefined : '<redacted>';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = walk(v as Record<string, unknown>, path);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export const registerConfig: CommandRegistrar = (program, io) => {
  const cfg = new Command('config').description('inspect or print example june1815 configuration');

  const show = new Command('show')
    .description('print the resolved config tree (secrets redacted)')
    .action((_opts: CommonOptionValues, command: Command) => {
      const common = (command.parent?.parent?.opts() ?? {});
      const cliPartial = commonOptionsToConfig(common);
      const config = loadConfig({ cliOverrides: cliPartial, env: process.env, homeDir: homedir() });
      io.stdout(`${JSON.stringify(redact(config), null, 2)}\n`);
    });
  applyCommonOptions(show);
  cfg.addCommand(show);

  const example = new Command('example')
    .description('print the annotated june1815.example.yml')
    .action(() => {
      // Resolve the example file relative to the package — works both in
      // dist/ and in source layouts.
      const here = dirname(fileURLToPath(import.meta.url));
      const candidates = [
        join(here, '..', '..', '..', 'june1815.example.yml'),
        join(here, '..', '..', 'june1815.example.yml'),
      ];
      let content: string | null = null;
      for (const c of candidates) {
        try {
          content = readFileSync(c, 'utf8');
          break;
        } catch {
          /* try next */
        }
      }
      if (content === null) {
        io.stderr('error: could not locate june1815.example.yml\n');
        io.exit(1);
        return;
      }
      io.stdout(content);
    });
  cfg.addCommand(example);

  program.addCommand(cfg);
};

export const __test = { redact };
