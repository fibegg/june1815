#!/usr/bin/env node
import { runCli } from './cli.js';
import { registerGogogo } from './commands/gogogo.js';
import { registerDoctor } from './commands/doctor.js';
import { registerConfig } from './commands/config.js';
// Read version directly from package.json so it tracks releases without
// build-time string substitution.
import pkg from '../../package.json' with { type: 'json' };

void runCli(process.argv, {
  version: (pkg as { version: string }).version,
  registrars: [registerGogogo, registerDoctor, registerConfig],
});
