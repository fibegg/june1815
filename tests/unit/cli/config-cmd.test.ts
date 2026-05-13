import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../../../src/config/schema.js';
import { __test } from '../../../src/cli/commands/config.js';

describe('config redaction', () => {
  it('replaces bearerToken with <redacted>', () => {
    const config = ConfigSchema.parse({
      server: { auth: { bearerToken: 'a'.repeat(32) } },
    });
    const out = __test.redact(config) as { server: { auth: { bearerToken: string } } };
    expect(out.server.auth.bearerToken).toBe('<redacted>');
  });

  it('passes through non-secret fields unchanged', () => {
    const config = ConfigSchema.parse({});
    const out = __test.redact(config) as { server: { port: number; host: string } };
    expect(out.server.port).toBe(7150);
    expect(out.server.host).toBe('127.0.0.1');
  });

  it('walks into nested objects', () => {
    const config = ConfigSchema.parse({
      server: { auth: { bearerToken: 'a'.repeat(32) }, port: 8888 },
    });
    const out = __test.redact(config) as {
      server: { auth: { bearerToken: string }; port: number };
    };
    expect(out.server.port).toBe(8888);
    expect(out.server.auth.bearerToken).toBe('<redacted>');
  });
});
