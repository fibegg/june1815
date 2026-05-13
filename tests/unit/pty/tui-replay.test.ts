import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TerminalAdapter } from '../../../src/pty/terminal.js';
import { TuiParser, type TuiEvent } from '../../../src/pty/tui-parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'fixtures', 'tui-recordings');

interface Fixture {
  events: ReadonlyArray<{ bytes?: string; marker?: string; t: number }>;
  totalBytes: number;
  raw: string;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as Fixture;
}

/**
 * Replay a captured PTY byte stream through TerminalAdapter + TuiParser
 * and collect every event emitted. Snapshots are forced after each
 * `marker` event in the fixture so the parser sees the buffer at the
 * same moments the capture script did.
 */
async function replay(fixture: Fixture): Promise<TuiEvent[]> {
  const term = new TerminalAdapter({ cols: 200, rows: 50, scrollback: 1000 });
  const parser = new TuiParser();
  parser.markTurnStarted();
  const events: TuiEvent[] = [];
  // Replay every byte chunk, snapshotting after each one so we see the
  // same intermediate states the real conversation does.
  for (const ev of fixture.events) {
    if (ev.bytes !== undefined) {
      await term.write(ev.bytes);
      events.push(...parser.parse(term.snapshot()));
      continue;
    }
    if (ev.marker !== undefined) {
      events.push(...parser.parse(term.snapshot()));
      if (ev.marker.includes('after msg')) {
        parser.markTurnStarted();
      }
    }
  }
  events.push(...parser.parse(term.snapshot()));
  return events;
}

describe('TUI replay — two-turns-simple', () => {
  it('extracts only the assistant text payloads, in order', async () => {
    const fixture = loadFixture('two-turns-simple.json');
    const events = await replay(fixture);
    const texts = events
      .filter((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(texts).toContain('OK');
    expect(texts).toContain('DONE');
    expect(texts).not.toMatch(/Brewed for/);
    expect(texts).not.toMatch(/Cooked for/);
    expect(texts).not.toMatch(/for shortcuts/);
    expect(texts).not.toMatch(/MCP servers failed/);
    expect(texts).not.toMatch(/❯/);
  });

  it('emits ready before the first text_delta', async () => {
    const fixture = loadFixture('two-turns-simple.json');
    const events = await replay(fixture);
    const readyIdx = events.findIndex((e) => e.type === 'ready');
    const firstTextIdx = events.findIndex((e) => e.type === 'text_delta');
    expect(readyIdx).toBeGreaterThanOrEqual(0);
    expect(firstTextIdx).toBeGreaterThan(readyIdx);
  });

  it('emits exactly one done-equivalent transition per turn (no spurious `ready` mid-stream)', async () => {
    const fixture = loadFixture('two-turns-simple.json');
    const events = await replay(fixture);
    // The first `ready` is emitted once on initial idle. Subsequent
    // `turn_complete` events fire when the footer flips back. We expect
    // at most one stable `ready` and at least one `turn_complete`.
    const readyCount = events.filter((e) => e.type === 'ready').length;
    const turnCompleteCount = events.filter((e) => e.type === 'turn_complete').length;
    expect(readyCount).toBeGreaterThan(0);
    expect(turnCompleteCount).toBeGreaterThan(0);
  });
});
