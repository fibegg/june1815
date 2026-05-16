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

async function drive(name: string): Promise<TuiEvent[]> {
  const fixture = JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as Fixture;
  const term = new TerminalAdapter({ cols: 200, rows: 50, scrollback: 1000 });
  const engine = new TuiEngine();
  const out: TuiEvent[] = [];
  let userTurnStarted = false;
  for (const ev of fixture.events) {
    if (ev.bytes !== undefined) {
      await term.write(ev.bytes);
      out.push(...engine.parse(term.snapshot()));
      // The boot phase has no user turn yet; mark started after we
      // see the first ready footer.
      if (!userTurnStarted && out.some((e) => e.type === 'ready')) {
        engine.markTurnStarted();
        userTurnStarted = true;
      }
    } else if (ev.marker !== undefined) {
      out.push(...engine.parse(term.snapshot()));
    }
  }
  out.push(...engine.parse(term.snapshot()));
  return out;
}

describe('image-error turn replay', () => {
  it('emits an `error` event surfacing the API failure', async () => {
    const events = await drive('image-error-turn.json');
    const err = events.find(
      (e): e is Extract<TuiEvent, { type: 'error' }> => e.type === 'error',
    );
    expect(err).toBeDefined();
    expect(err?.code).toBe('claude_api_error');
    expect(err?.message).toMatch(/Could not process image/);
  });

  it('emits a `tool_result` for the Read of the upload file', async () => {
    const events = await drive('image-error-turn.json');
    const tool = events.find(
      (e): e is Extract<TuiEvent, { type: 'tool_result' }> =>
        e.type === 'tool_result' && e.name === 'Read',
    );
    expect(tool).toBeDefined();
    expect(tool?.summary).toMatch(/\.png/);
  });

  it('emits `turn_complete` even though no `⏺ <text>` was rendered', async () => {
    const events = await drive('image-error-turn.json');
    expect(events.find((e) => e.type === 'turn_complete')).toBeDefined();
  });

  it('does not emit a spurious `text_delta` for an error-only turn', async () => {
    const events = await drive('image-error-turn.json');
    const texts = events.filter((e) => e.type === 'text_delta');
    // Allow zero, but if any were emitted they should not contain
    // the error message body or the tool path.
    for (const t of texts as Array<Extract<TuiEvent, { type: 'text_delta' }>>) {
      expect(t.text).not.toMatch(/API Error/);
      expect(t.text).not.toMatch(/Could not process image/);
    }
  });
});
