import pino, { type Logger, type LoggerOptions as PinoLoggerOptions } from 'pino';
import type { Config, LoggerConfig, Mode } from './config/schema.js';

export type { Logger };

export interface LoggerOptions {
  level: LoggerConfig['level'];
  pretty: boolean;
}

/**
 * Resolve the effective logger options from a Config + a TTY hint.
 *
 * The TTY hint is a parameter (not read from `process.stdout` directly) so
 * the resolver stays a pure function and is unit-testable without faking
 * global streams.
 */
export function loggerOptionsFromConfig(
  config: Config,
  isStdoutTty: boolean,
): LoggerOptions {
  const effectiveMode: Mode = config.mode ?? (isStdoutTty ? 'interactive' : 'headless');
  const pretty = config.logger.pretty ?? effectiveMode === 'interactive';
  return { level: config.logger.level, pretty };
}

/**
 * Build a pino logger from the resolved options.
 *
 * - `pretty: true` routes output through `pino-pretty` for human readers.
 * - `pretty: false` emits structured JSON suitable for log aggregation.
 *
 * The function returns the logger immediately; pino's transport workers
 * spawn lazily and do not block.
 */
export function createLogger(opts: LoggerOptions): Logger {
  const base: PinoLoggerOptions = {
    level: opts.level,
    base: { name: 'june1815' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (opts.pretty) {
    return pino({
      ...base,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname,name',
          messageFormat: '{msg}',
        },
      },
    });
  }
  return pino(base);
}
