import { Terminal } from '@xterm/headless';

/**
 * A point-in-time view of the virtual terminal's buffer. Plain-text only;
 * styling and color information are intentionally dropped because the TUI
 * parser works on textual landmarks.
 */
export interface TerminalSnapshot {
  readonly cols: number;
  readonly rows: number;
  /** All buffered lines, INCLUDING scrollback, ordered oldest first. */
  readonly lines: readonly string[];
  /** Index into `lines` of the first visible viewport line. */
  readonly viewportTop: number;
  /** Cursor column (0-based). */
  readonly cursorX: number;
  /** Cursor row in absolute `lines` coordinates (not relative to viewport). */
  readonly cursorY: number;
}

export interface TerminalAdapterOptions {
  readonly cols: number;
  readonly rows: number;
  /** Maximum scrollback (lines). Defaults to 1000. */
  readonly scrollback?: number;
}

/**
 * Adapter around `@xterm/headless`. Accepts raw PTY bytes via `write` and
 * exposes a point-in-time snapshot of the rendered screen. The TUI parser
 * (next commits) builds on top of these snapshots.
 *
 * `write` is promise-returning so tests can await each chunk before
 * snapshotting; xterm's parser is async-internally and the data isn't
 * reflected in the buffer until the parse completes.
 */
export class TerminalAdapter {
  private readonly term: Terminal;

  constructor(opts: TerminalAdapterOptions) {
    this.term = new Terminal({
      cols: opts.cols,
      rows: opts.rows,
      scrollback: opts.scrollback ?? 1000,
      allowProposedApi: true,
    });
  }

  get cols(): number {
    return this.term.cols;
  }

  get rows(): number {
    return this.term.rows;
  }

  write(data: string | Uint8Array): Promise<void> {
    return new Promise<void>((resolve) => {
      this.term.write(data, () => { resolve(); });
    });
  }

  resize(cols: number, rows: number): void {
    this.term.resize(cols, rows);
  }

  snapshot(): TerminalSnapshot {
    const buf = this.term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < buf.length; y += 1) {
      const line = buf.getLine(y);
      lines.push(line ? line.translateToString(true) : '');
    }
    return {
      cols: this.term.cols,
      rows: this.term.rows,
      lines,
      viewportTop: buf.viewportY,
      cursorX: buf.cursorX,
      cursorY: buf.baseY + buf.cursorY,
    };
  }

  dispose(): void {
    this.term.dispose();
  }
}

/**
 * Return only the visible viewport portion of a snapshot.
 * Convenience for parsers that don't care about scrollback.
 */
export function viewportLines(snap: TerminalSnapshot): readonly string[] {
  return snap.lines.slice(snap.viewportTop, snap.viewportTop + snap.rows);
}
