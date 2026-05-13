import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, InputDriver, type PtyWriter } from '../../../src/pty/input-driver.js';

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
  it('writes text followed by the submit keystroke', () => {
    const w = recordingWriter();
    new InputDriver(w).send('hello');
    expect(w.joined()).toBe(`hello${DEFAULT_KEYS.submit}`);
  });

  it('splits embedded newlines into soft newlines + one submit', () => {
    const w = recordingWriter();
    new InputDriver(w).send('line one\nline two');
    expect(w.writes).toEqual(['line one', DEFAULT_KEYS.newline, 'line two', DEFAULT_KEYS.submit]);
  });

  it('an empty line in the middle still produces a soft newline', () => {
    const w = recordingWriter();
    new InputDriver(w).send('a\n\nb');
    expect(w.writes).toEqual(['a', DEFAULT_KEYS.newline, DEFAULT_KEYS.newline, 'b', DEFAULT_KEYS.submit]);
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
    const driver = new InputDriver(w, { ...DEFAULT_KEYS, submit: '\n', interrupt: '\x04' });
    driver.send('hi');
    driver.interrupt();
    expect(w.writes).toEqual(['hi', '\n', '\x04']);
  });
});
