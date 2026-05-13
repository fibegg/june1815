import { describe, expect, it } from 'vitest';
import { SessionMarkerStore, type SessionMarkerFs } from '../../../src/conversation/session-marker.js';

function inMemoryFs(initial: Record<string, string> = {}): SessionMarkerFs & {
  files: Record<string, string>;
} {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    existsSync: (p) => p in files,
    readFileSync: (p) => {
      const f = files[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    writeFileSync: (p, d) => {
      files[p] = d;
    },
    mkdirSync: () => {
      /* in-memory, no-op */
    },
    rmSync: (p) => {
      delete files[p];
    },
  };
}

describe('SessionMarkerStore', () => {
  it('returns null for unknown conversation', () => {
    const store = new SessionMarkerStore('/d', inMemoryFs());
    expect(store.read('nope')).toBeNull();
  });

  it('writes and reads back a session id', () => {
    const fs = inMemoryFs();
    const store = new SessionMarkerStore('/d', fs);
    store.write('c1', 'session-abc');
    expect(store.read('c1')).toBe('session-abc');
    expect(fs.files['/d/conversations/c1/session.txt']).toBe('session-abc');
  });

  it('trims whitespace on write and read', () => {
    const store = new SessionMarkerStore('/d', inMemoryFs());
    store.write('c1', '  session-xyz  \n');
    expect(store.read('c1')).toBe('session-xyz');
  });

  it('treats a whitespace-only marker as missing', () => {
    const fs = inMemoryFs({ '/d/conversations/c1/session.txt': '   \n' });
    const store = new SessionMarkerStore('/d', fs);
    expect(store.read('c1')).toBeNull();
  });

  it('delete removes the marker', () => {
    const store = new SessionMarkerStore('/d', inMemoryFs());
    store.write('c1', 'session-abc');
    store.delete('c1');
    expect(store.read('c1')).toBeNull();
  });

  it('delete is a no-op when no marker exists', () => {
    const store = new SessionMarkerStore('/d', inMemoryFs());
    expect(() => store.delete('nope')).not.toThrow();
  });
});
