import { describe, expect, it } from 'vitest';
import { TerminalAdapter, viewportLines } from '../../../src/pty/terminal.js';

describe('TerminalAdapter', () => {
  it('initializes with the configured geometry', () => {
    const t = new TerminalAdapter({ cols: 80, rows: 24 });
    expect(t.cols).toBe(80);
    expect(t.rows).toBe(24);
    const snap = t.snapshot();
    expect(snap.cols).toBe(80);
    expect(snap.rows).toBe(24);
    t.dispose();
  });

  it('records plain text on the first line', async () => {
    const t = new TerminalAdapter({ cols: 80, rows: 24 });
    await t.write('hello world');
    const snap = t.snapshot();
    expect(snap.lines[0]).toBe('hello world');
    expect(snap.cursorY).toBe(0);
    expect(snap.cursorX).toBe(11);
    t.dispose();
  });

  it('handles CR + LF as newline', async () => {
    const t = new TerminalAdapter({ cols: 80, rows: 24 });
    await t.write('line one\r\nline two');
    const snap = t.snapshot();
    expect(snap.lines[0]).toBe('line one');
    expect(snap.lines[1]).toBe('line two');
    t.dispose();
  });

  it('respects ANSI cursor positioning', async () => {
    const t = new TerminalAdapter({ cols: 80, rows: 24 });
    // CSI 1;1H — move cursor home; then overwrite with HI
    await t.write('xxxxx');
    await t.write('\x1b[1;1H');
    await t.write('HI');
    const snap = t.snapshot();
    expect(snap.lines[0]?.slice(0, 5)).toBe('HIxxx');
    t.dispose();
  });

  it('resize updates dimensions', () => {
    const t = new TerminalAdapter({ cols: 80, rows: 24 });
    t.resize(200, 50);
    expect(t.cols).toBe(200);
    expect(t.rows).toBe(50);
    t.dispose();
  });

  it('records scrollback for content that scrolls past the viewport', async () => {
    const t = new TerminalAdapter({ cols: 80, rows: 5, scrollback: 100 });
    // Write 10 lines into a 5-row terminal -> 5 lines fall into scrollback
    for (let i = 1; i <= 10; i += 1) {
      await t.write(`L${i}\r\n`);
    }
    const snap = t.snapshot();
    const allText = snap.lines.join('|');
    expect(allText).toContain('L1');
    expect(allText).toContain('L10');
    t.dispose();
  });

  it('viewportLines returns only the visible window', async () => {
    const t = new TerminalAdapter({ cols: 80, rows: 3 });
    await t.write('A\r\nB\r\nC');
    const snap = t.snapshot();
    const visible = viewportLines(snap);
    expect(visible.length).toBe(3);
    expect(visible[0]).toBe('A');
    expect(visible[1]).toBe('B');
    expect(visible[2]).toBe('C');
    t.dispose();
  });
});
