// Vitest setup file. Reserved for cross-cutting test bootstrap (env scrubbing,
// global timers, polyfills). Keep narrow — anything heavier belongs in fixtures.

import { afterEach } from 'vitest';

afterEach(() => {
  // Reset any module-level singletons created via dynamic import in tests.
});
