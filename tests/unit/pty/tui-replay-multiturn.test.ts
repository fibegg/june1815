import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TerminalAdapter } from '../../../src/pty/terminal.js';
import { TuiEngine } from '../../../src/pty/tui/engine.js';
import type { TuiEvent } from '../../../src/pty/tui/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, '..', '..', 'fixtures', 'tui-recordings');

interface Fixture {
  events: ReadonlyArray<{ bytes?: string; marker?: string; t: number }>;
}

function loadFixture(name: string): Fixture {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as Fixture;
}

/** Drive the engine the way Conversation does: write each byte chunk,
 *  snapshot, parse. At each marker that says "after turnN", call
 *  `markTurnStarted()` to mirror real per-turn state resetting. */
async function drive(fixture: Fixture): Promise<TuiEvent[]> {
  const term = new TerminalAdapter({ cols: 200, rows: 50, scrollback: 1000 });
  const engine = new TuiEngine();
  const events: TuiEvent[] = [];

  // Initial state: engine has not been told a turn is in flight.
  for (const ev of fixture.events) {
    if (ev.bytes !== undefined) {
      await term.write(ev.bytes);
      events.push(...engine.parse(term.snapshot()));
    } else if (ev.marker !== undefined) {
      events.push(...engine.parse(term.snapshot()));
      if (ev.marker.startsWith('== after turn')) {
        engine.markTurnStarted();
      } else if (ev.marker === '== boot done ==') {
        // The first user write happens right after — mark the new turn.
        engine.markTurnStarted();
      }
    }
  }
  events.push(...engine.parse(term.snapshot()));
  return events;
}

describe('multi-turn text-only replay', () => {
  it('emits clean text_delta for each turn, no cross-turn leakage', async () => {
    const fixture = loadFixture('multi-turn-text-only.json');
    const events = await drive(fixture);
    const texts = events
      .filter((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text);

    // Concatenated full string per turn must NOT contain the wrong response.
    const joined = texts.join('|');
    expect(joined).toContain('Hi!');
    expect(joined).toContain('An app icon');

    // Critically: the turn-2 payload must not contain the turn-1 prefix.
    const turn2 = texts.find((t) => t.includes('An app icon')) ?? '';
    expect(turn2).not.toContain('Hi! What would you like');
    expect(turn2.startsWith('An app icon') || turn2.includes('\nAn app icon')).toBe(true);
  });

  it('does not emit reasoning_delta for past-tense turn summaries', async () => {
    const fixture = loadFixture('multi-turn-text-only.json');
    const events = await drive(fixture);
    const reasoningTexts = events
      .filter((e): e is Extract<TuiEvent, { type: 'reasoning_delta' }> => e.type === 'reasoning_delta')
      .map((e) => e.text);
    for (const r of reasoningTexts) {
      expect(r).not.toMatch(/Worked for|Churned for|Brewed for|Cogitated for/);
    }
  });

  it('does not emit reasoning_delta for spinner-only `Cogitating…` lines', async () => {
    const fixture = loadFixture('multi-turn-text-only.json');
    const events = await drive(fixture);
    const reasoningTexts = events
      .filter((e): e is Extract<TuiEvent, { type: 'reasoning_delta' }> => e.type === 'reasoning_delta')
      .map((e) => e.text);
    // A bare spinner line with no content below should not produce an event.
    for (const r of reasoningTexts) {
      expect(r.length).toBeGreaterThan(0);
      expect(r).not.toMatch(/^(Cogitating|Crunching|Simmering|Percolating|Deciphering|Crystallizing|Shenaniganing)…?$/);
    }
  });

  it('emits exactly one ready, and at least two turn_complete (one per turn)', async () => {
    const fixture = loadFixture('multi-turn-text-only.json');
    const events = await drive(fixture);
    expect(events.filter((e) => e.type === 'ready')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'turn_complete').length).toBeGreaterThanOrEqual(2);
  });

  it('does not emit assistant text from prior turns after `turn_complete`', async () => {
    const fixture = loadFixture('multi-turn-text-only.json');
    const events = await drive(fixture);
    // The full text-delta stream should not repeat "Hi!" after the
    // second turn started.
    const eventTypes = events.map((e) => e.type);
    const turnCompleteIdx = eventTypes.indexOf('turn_complete');
    expect(turnCompleteIdx).toBeGreaterThan(-1);
    const afterTurn1 = events.slice(turnCompleteIdx + 1);
    const textsAfter = afterTurn1
      .filter((e): e is Extract<TuiEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text);
    for (const t of textsAfter) {
      expect(t).not.toContain('Hi! What would you like to work on?');
    }
  });
});
