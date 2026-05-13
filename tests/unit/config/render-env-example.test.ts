import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderEnvExample } from '../../../src/config/render-env-example.js';
import { ENV_KEYS } from '../../../src/config/env-keys.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..', '..');

describe('renderEnvExample', () => {
  it('includes a line for every env key', () => {
    const text = renderEnvExample();
    for (const k of ENV_KEYS) {
      expect(text).toContain(`${k.env}=`);
      expect(text).toContain(`# YAML path: ${k.yaml}`);
    }
  });

  it('annotates secret values with a warning', () => {
    const text = renderEnvExample();
    expect(text).toMatch(/WARNING: secret/);
  });

  it('emits a header pointing back to env-keys.ts', () => {
    const text = renderEnvExample();
    expect(text).toContain('auto-generated from src/config/env-keys.ts');
  });

  it('the checked-in .env.example matches the renderer output (drift check)', () => {
    const onDisk = readFileSync(join(repoRoot, '.env.example'), 'utf8');
    expect(onDisk).toBe(renderEnvExample());
  });
});
