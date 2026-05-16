import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, InputDriver, type PtyWriter } from '../../../src/pty/input-driver.js';

/** Synchronous `setTimeout` for tests — runs the callback inline so test
 *  assertions don't have to await timers. */
const syncTimer: (cb: () => void, _ms: number) => unknown = (cb) => {
  cb();
  return 0;
};

function recordingWriter(): PtyWriter & { writes: string[]; joined(): string } {
  const writes: string[] = [];
  return {
    writes,
    write: (d) => writes.push(d),
    joined() {
      return writes.join('');
    },
  };
}

describe('InputDriver.send', () => {
  it('writes the body atomically, then the submit keystroke after a delay', () => {
    // Body and submit are written separately by design — claude's TUI
    // drops the submit keystroke if it arrives in the same read as a
    // long paste. The delay is configurable and bypassed in tests via
    // the syncTimer hook.
    const w = recordingWriter();
    new InputDriver(w, DEFAULT_KEYS, 200, syncTimer).send('hello');
    expect(w.writes).toEqual(['hello', DEFAULT_KEYS.submit]);
  });

  it('joins embedded \\n with the soft-newline key in the body write', () => {
    const w = recordingWriter();
    new InputDriver(w, DEFAULT_KEYS, 200, syncTimer).send('line one\nline two');
    expect(w.writes).toEqual([
      `line one${DEFAULT_KEYS.newline}line two`,
      DEFAULT_KEYS.submit,
    ]);
  });

  it('an empty middle line still produces a doubled soft newline', () => {
    const w = recordingWriter();
    new InputDriver(w, DEFAULT_KEYS, 200, syncTimer).send('a\n\nb');
    expect(w.writes).toEqual([
      `a${DEFAULT_KEYS.newline}${DEFAULT_KEYS.newline}b`,
      DEFAULT_KEYS.submit,
    ]);
  });

  it('defers the submit keystroke through the injected timer', () => {
    const w = recordingWriter();
    const calls: Array<{ ms: number }> = [];
    const captureTimer: (cb: () => void, ms: number) => unknown = (cb, ms) => {
      calls.push({ ms });
      cb();
      return 0;
    };
    new InputDriver(w, DEFAULT_KEYS, 175, captureTimer).send('hi');
    expect(calls).toEqual([{ ms: 175 }]);
  });
});

describe('InputDriver.typeMessage', () => {
  it('types without submitting', () => {
    const w = recordingWriter();
    new InputDriver(w).typeMessage('hi');
    expect(w.joined()).toBe('hi');
    expect(w.joined()).not.toContain(DEFAULT_KEYS.submit);
  });
});

describe('InputDriver.interrupt', () => {
  it('writes only the interrupt keystroke', () => {
    const w = recordingWriter();
    new InputDriver(w).interrupt();
    expect(w.writes).toEqual([DEFAULT_KEYS.interrupt]);
  });
});

describe('InputDriver.steer', () => {
  it('writes the steer prefix, then text, then submit', () => {
    const w = recordingWriter();
    new InputDriver(w).steer('actually do X instead');
    expect(w.writes[0]).toBe(DEFAULT_KEYS.steerPrefix);
    expect(w.joined()).toContain('actually do X instead');
    expect(w.writes[w.writes.length - 1]).toBe(DEFAULT_KEYS.submit);
  });

  it('omits the prefix when configured empty', () => {
    const w = recordingWriter();
    const driver = new InputDriver(w, { ...DEFAULT_KEYS, steerPrefix: '' });
    driver.steer('go');
    expect(w.writes).toEqual(['go', DEFAULT_KEYS.submit]);
  });
});

describe('InputDriver.clearLine and raw', () => {
  it('clearLine writes Ctrl-U by default', () => {
    const w = recordingWriter();
    new InputDriver(w).clearLine();
    expect(w.writes).toEqual([DEFAULT_KEYS.clearLine]);
  });

  it('raw passes through verbatim', () => {
    const w = recordingWriter();
    new InputDriver(w).raw('\x1b[A');
    expect(w.writes).toEqual(['\x1b[A']);
  });
});

describe('InputDriver with custom keys', () => {
  it('uses overridden submit and interrupt', () => {
    const w = recordingWriter();
    const driver = new InputDriver(
      w,
      { ...DEFAULT_KEYS, submit: '\n', interrupt: '\x04' },
      200,
      syncTimer,
    );
    driver.send('hi');
    driver.interrupt();
    expect(w.writes).toEqual(['hi', '\n', '\x04']);
  });
});
