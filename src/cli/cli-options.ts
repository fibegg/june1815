import { Option, type Command } from 'commander';
import type { Config } from '../config/schema.js';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Apply the set of common flags that every command honors. */
export function applyCommonOptions(cmd: Command): Command {
  return cmd
    .option('--config <path>', 'path to a june15.yml config file (overrides ./june15.yml)')
    .option('--data-dir <path>', 'override JUNE15_DATA_DIR')
    .option('--log-level <level>', 'pino log level: fatal|error|warn|info|debug|trace')
    .addOption(new Option('--headless', 'force headless mode').conflicts('interactive'))
    .addOption(new Option('--interactive', 'force interactive mode').conflicts('headless'));
}

/** Common option shape produced by commander when `applyCommonOptions` was
 *  applied. */
export interface CommonOptionValues {
  config?: string;
  dataDir?: string;
  logLevel?: string;
  headless?: boolean;
  interactive?: boolean;
}

/** Convert raw commander option values into a partial Config tree the
 *  loader can merge. CLI is the highest-precedence layer (per ADR-0004). */
export function commonOptionsToConfig(opts: CommonOptionValues): DeepPartial<Config> {
  const out: DeepPartial<Config> = {};
  if (opts.dataDir) out.dataDir = opts.dataDir;
  if (opts.logLevel) out.logger = { level: opts.logLevel as Config['logger']['level'] };
  if (opts.headless === true) out.mode = 'headless';
  if (opts.interactive === true) out.mode = 'interactive';
  return out;
}
