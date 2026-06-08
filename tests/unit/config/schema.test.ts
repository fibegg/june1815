import { describe, expect, it } from 'vitest';
import {
  ConfigSchema,
  ClaudeConfigSchema,
  PtyConfigSchema,
  ServerConfigSchema,
} from '../../../src/config/schema.js';

describe('ConfigSchema', () => {
  it('returns a fully-formed config from an empty object', () => {
    const result = ConfigSchema.parse({});
    expect(result.server.host).toBe('127.0.0.1');
    expect(result.server.port).toBe(7150);
    expect(result.claude.autoInstall).toBe(false);
    expect(result.pty.cols).toBe(200);
    expect(result.pty.rows).toBe(50);
    expect(result.pty.idleQuietMs).toBe(10);
    expect(result.logger.level).toBe('info');
    expect(result.limits.maxConversations).toBe(8);
  });

  it('rejects unknown top-level keys', () => {
    expect(() => ConfigSchema.parse({ unknownKey: 1 })).toThrow();
  });

  it('rejects out-of-range port', () => {
    expect(() => ConfigSchema.parse({ server: { port: 0 } })).toThrow();
    expect(() => ConfigSchema.parse({ server: { port: 70_000 } })).toThrow();
  });

  it('rejects bearer tokens that are too short', () => {
    expect(() =>
      ConfigSchema.parse({ server: { auth: { bearerToken: 'too-short' } } }),
    ).toThrow();
  });

  it('accepts a fully populated tree', () => {
    const populated = ConfigSchema.parse({
      mode: 'headless',
      dataDir: '/var/lib/june1815',
      server: { host: '0.0.0.0', port: 8080, auth: { bearerToken: 'a'.repeat(32) } },
      claude: { path: '/usr/local/bin/claude', autoInstall: true },
      pty: { cols: 240, rows: 80, idleQuietMs: 20 },
      logger: { level: 'debug', pretty: false },
      limits: { maxConversations: 16 },
    });
    expect(populated.mode).toBe('headless');
    expect(populated.server.port).toBe(8080);
    expect(populated.pty.cols).toBe(240);
  });

  it('rejects modes outside the enum', () => {
    expect(() => ConfigSchema.parse({ mode: 'turbo' })).toThrow();
  });
});

describe('PtyConfigSchema', () => {
  it('clamps oversize values via min/max', () => {
    expect(() => PtyConfigSchema.parse({ cols: 50 })).toThrow();
    expect(() => PtyConfigSchema.parse({ cols: 600 })).toThrow();
    expect(() => PtyConfigSchema.parse({ rows: 10 })).toThrow();
    expect(() => PtyConfigSchema.parse({ idleQuietMs: 0 })).toThrow();
  });
});

describe('ClaudeConfigSchema', () => {
  it('autoInstall defaults to false', () => {
    expect(ClaudeConfigSchema.parse({}).autoInstall).toBe(false);
  });
});

describe('ServerConfigSchema', () => {
  it('produces sensible defaults', () => {
    const s = ServerConfigSchema.parse({});
    expect(s.host).toBe('127.0.0.1');
    expect(s.port).toBe(7150);
    expect(s.auth.bearerToken).toBeUndefined();
  });
});
