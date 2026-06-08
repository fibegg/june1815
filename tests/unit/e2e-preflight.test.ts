import { describe, expect, it } from 'vitest';
import { checkPreflight } from '../e2e/helpers/preflight.js';

describe('e2e preflight (unit)', () => {
  it('skips when neither claude nor auth is available', () => {
    const r = checkPreflight({ PATH: '/nonexistent', HOME: '/no-home' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/claude binary not found|no claude auth/i);
  });

  it('does not return ok=true purely from PATH; auth must also resolve', () => {
    // Force-find a fake claude via override; rest of env has no auth.
    const r = checkPreflight({
      JUNE1815_CLAUDE_PATH: '/nonexistent/claude',
      PATH: '/nonexistent',
      HOME: '/no-home',
    });
    expect(r.ok).toBe(false);
  });
});
