import { homedir } from 'node:os';
import { locateClaude } from '../../../src/claude/locator.js';
import { detectAuth } from '../../../src/claude/auth-detector.js';

export interface PreflightOk {
  readonly ok: true;
  readonly claudePath: string;
  readonly authSource: string;
}

export interface PreflightSkip {
  readonly ok: false;
  readonly reason: string;
}

export type Preflight = PreflightOk | PreflightSkip;

/**
 * Decide whether the e2e suite can run. We require:
 *   - `claude` resolvable on PATH or via JUNE15_CLAUDE_PATH
 *   - An authenticated source (env or token file or claude credentials)
 *
 * When either is missing, the suite is skipped cleanly so local devs and
 * forks without claude don't see hard failures.
 *
 * Override with `JUNE15_E2E_FORCE=1` to make a missing prerequisite
 * fail the suite hard (useful in CI lanes where the secret should be
 * present).
 */
export function checkPreflight(env: NodeJS.ProcessEnv = process.env): Preflight {
  const overridePath = env['JUNE15_CLAUDE_PATH'];
  const locatorInput: Parameters<typeof locateClaude>[0] = {
    home: homedir(),
    platform: process.platform,
  };
  if (typeof env['PATH'] === 'string') locatorInput.pathVar = env['PATH'];
  if (overridePath) locatorInput.overridePath = overridePath;
  const located = locateClaude(locatorInput);
  if (!located.found) {
    return { ok: false, reason: 'claude binary not found on PATH' };
  }
  const auth = detectAuth({ env, homeDir: homedir() });
  if (!auth.authenticated) {
    return { ok: false, reason: 'no claude auth source resolved' };
  }
  return { ok: true, claudePath: located.path, authSource: auth.source };
}
