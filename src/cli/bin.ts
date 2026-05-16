#!/usr/bin/env node
import { runCli } from './cli.js';
import { registerGogogo } from './commands/gogogo.js';
import { registerDoctor } from './commands/doctor.js';
import { registerConfig } from './commands/config.js';
import { isShimInvocation } from './shim/detect.js';
import { runShim } from './shim/runner.js';
// Read version directly from package.json so it tracks releases without
// build-time string substitution.
import pkg from '../../package.json' with { type: 'json' };

const argv = process.argv.slice(2);

// Stream-JSON shim mode: when the caller passes the IPC flags
// (`--output-format stream-json`, `--input-format stream-json`, `-p`,
// `--print`), we bypass commander entirely and act as a drop-in `claude`
// stream-json adapter that drives the wrapped TUI under the hood.
if (isShimInvocation(argv)) {
  void runShim({ argv, env: process.env }).then(
    (code) => { process.exit(code); },
    (err: unknown) => {
      process.stderr.write(`shim: ${(err as Error).message}\n`);
      process.exit(1);
    },
  );
} else {
  void runCli(process.argv, {
    version: (pkg as { version: string }).version,
    registrars: [registerGogogo, registerDoctor, registerConfig],
  });
}
