#!/usr/bin/env tsx
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { renderEnvExample } from '../src/config/render-env-example.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const outPath = join(repoRoot, '.env.example');

writeFileSync(outPath, renderEnvExample(), 'utf8');
// eslint-disable-next-line no-console
console.log(`wrote ${outPath}`);
