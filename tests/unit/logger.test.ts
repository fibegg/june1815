import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../../src/config/schema.js';
import { createLogger, loggerOptionsFromConfig } from '../../src/logger.js';

describe('loggerOptionsFromConfig', () => {
  it('defaults to pretty when mode resolves to interactive (TTY)', () => {
    const cfg = ConfigSchema.parse({});
    const opts = loggerOptionsFromConfig(cfg, /* isStdoutTty */ true);
    expect(opts.pretty).toBe(true);
    expect(opts.level).toBe('info');
  });

  it('defaults to non-pretty when mode resolves to headless (no TTY)', () => {
    const cfg = ConfigSchema.parse({});
    const opts = loggerOptionsFromConfig(cfg, /* isStdoutTty */ false);
    expect(opts.pretty).toBe(false);
  });

  it('an explicit mode beats TTY detection', () => {
    const cfg = ConfigSchema.parse({ mode: 'headless' });
    const opts = loggerOptionsFromConfig(cfg, /* isStdoutTty */ true);
    expect(opts.pretty).toBe(false);
  });

  it('an explicit pretty flag wins over the mode default', () => {
    const cfg = ConfigSchema.parse({ mode: 'headless', logger: { pretty: true } });
    const opts = loggerOptionsFromConfig(cfg, false);
    expect(opts.pretty).toBe(true);
  });

  it('passes through the level', () => {
    const cfg = ConfigSchema.parse({ logger: { level: 'debug' } });
    const opts = loggerOptionsFromConfig(cfg, false);
    expect(opts.level).toBe('debug');
  });
});

describe('createLogger', () => {
  it('returns a logger with the standard pino API in non-pretty mode', () => {
    const log = createLogger({ level: 'fatal', pretty: false });
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
    expect(typeof log.child).toBe('function');
    // smoke: calling does not throw
    log.info('hello');
  });
});
