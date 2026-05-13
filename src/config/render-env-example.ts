import { ENV_KEYS } from './env-keys.js';

const HEADER = [
  '# june15 environment reference.',
  '#',
  '# This file is auto-generated from src/config/env-keys.ts by',
  '# `npm run gen:env-example`. Do not edit by hand — edit env-keys.ts.',
  '#',
  '# Every key listed here can also live under the equivalent YAML path in',
  '# `june15.yml`. Precedence: CLI args > process.env > project june15.yml >',
  '# ~/.config/june15/june15.yml > built-in defaults.',
  '',
];

/** Produce the canonical `.env.example` text. Pure function for testing. */
export function renderEnvExample(): string {
  const out: string[] = [...HEADER];
  for (const k of ENV_KEYS) {
    out.push(`# ${k.description}`);
    out.push(`# YAML path: ${k.yaml}`);
    if (k.secret === true) {
      out.push('# WARNING: secret value — do not commit a real one to git.');
    }
    const value = k.example ?? '';
    out.push(`${k.env}=${value}`);
    out.push('');
  }
  return out.join('\n');
}
