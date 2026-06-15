import { stripAnsiLines } from '../ansi.js';
import type { TerminalSnapshot } from '../terminal.js';
import { computeAnchor } from './anchoring.js';
import {
  BLOCK_EXTRACTORS,
  LINE_EXTRACTORS,
  type BlockExtractor,
} from './extractors.js';
import { matches } from './markers.js';
import { initialParserState, type ParserState, type TuiEvent } from './types.js';

/**
 * The engine that runs the centralized rule set against a snapshot.
 *
 * Pipeline per `parse()` call:
 *
 *   1. Strip ANSI from every line in the snapshot.
 *   2. Compute the anchor (`lastUserEcho + 1`).
 *   3. Run every BlockExtractor in registry order. Each one:
 *        - finds its start line (first or last matching, anchor-bounded)
 *        - reads forward, applying its stops/skips
 *        - runs its transform pipeline
 *        - asks `emit()` for events + state updates
 *   4. Run every LineExtractor (full-line predicates without block
 *      semantics).
 *   5. Merge all state updates into the persistent state.
 *
 * No regex literals leak into this file. Everything reads through
 * `markers.ts` by name.
 */

export class TuiEngine {
  private state: ParserState = initialParserState();

  reset(): void {
    this.state = initialParserState();
  }

  /** Reset per-turn state. Keeps cross-turn dedup sets and the previous
   *  turn's final text (so the assistant extractor can subtract it if
   *  claude renders a concatenated buffer line). */
  markTurnStarted(): void {
    this.state.previousTurnFinalText = this.state.emittedAssistantText;
    this.state.emittedAssistantText = '';
    this.state.emittedReasoning = '';
    this.state.announcedTools = new Set();
    this.state.announcedToolResults = new Set();
    this.state.emittedPermission = new Set();
    this.state.turnHadActivity = false;
    this.state.inTurn = true;
    // The footer hasn't been observed yet for this turn. Reset to
    // `unknown` so a `ready` → `busy` → `ready` arc fires exactly one
    // `turn_complete` event, even if the parser sees `ready` first.
    this.state.lastFooter = 'unknown';
    this.state.sawBusyInTurn = false;
  }

  /** Inspect the live state (for tests and debug). Returns a shallow
   *  copy; the engine's own state is untouched. */
  snapshotState(): ParserState {
    return {
      ...this.state,
      announcedTools: new Set(this.state.announcedTools),
      emittedUsage: new Set(this.state.emittedUsage),
      emittedPermission: new Set(this.state.emittedPermission),
      emittedAuthUrl: new Set(this.state.emittedAuthUrl),
    };
  }

  parse(snap: TerminalSnapshot): TuiEvent[] {
    const lines = stripAnsiLines(snap.lines);
    const anchor = computeAnchor(lines);
    const out: TuiEvent[] = [];

    for (const ex of BLOCK_EXTRACTORS) {
      const { events, stateUpdate } = this.runBlockExtractor(ex, lines, anchor, snap.cursorY);
      if (events.length > 0) out.push(...events);
      this.applyStateUpdate(stateUpdate);
    }

    for (const ex of LINE_EXTRACTORS) {
      const { events, stateUpdate } = ex.apply({ lines, state: this.state, anchor });
      if (events.length > 0) out.push(...events);
      this.applyStateUpdate(stateUpdate);
    }

    // Side effect of turn_complete: the previous turn's text becomes
    // "frozen" so the next turn's extractor can subtract it; we also
    // latch `lastFooter` to `ready` so subsequent snapshots (still
    // showing the ready footer) don't fire another turn_complete.
    if (out.some((e) => e.type === 'turn_complete')) {
      this.state.previousTurnFinalText = this.state.emittedAssistantText;
      this.state.inTurn = false;
      this.state.turnHadActivity = false;
      this.state.lastFooter = 'ready';
    }

    return out;
  }

  private runBlockExtractor(
    ex: BlockExtractor,
    lines: readonly string[],
    anchor: number,
    cursorY: number,
  ): { events: readonly TuiEvent[]; stateUpdate: Partial<ParserState> } {
    const searchFrom = ex.ignoreAnchor === true ? 0 : anchor;
    const startIdx = ex.findLast === true
      ? this.findLastMatching(lines, ex, searchFrom)
      : this.findFirstMatching(lines, ex, searchFrom);
    if (startIdx < 0) return { events: [], stateUpdate: {} };

    const stopSet = ex.stops;
    const skipSet = ex.skips;
    const collected: string[] = [];

    // The starter line itself often contains the first chunk of content.
    const startLine = lines[startIdx] ?? '';
    const stripped = stripStarterMarker(startLine, ex.start);
    collected.push(stripped);

    // Slack past the cursor so a still-being-written response doesn't
    // get truncated mid-character — but cap so we don't pull leagues
    // of buffer.
    const upperBound = Math.min(lines.length, Math.max(cursorY + 1, startIdx + 1) + 200);

    for (let i = startIdx + 1; i < upperBound; i += 1) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();
      if (trimmed.length > 0 && stopSet.some((m) => matches(m, trimmed))) break;
      if (skipSet.some((m) => matches(m, line))) continue;
      collected.push(line);
    }

    let processed: readonly string[] = collected;
    for (const t of ex.transforms) processed = t(processed);
    const text = processed.join('\n').trim();
    return ex.emit({ text, lines: processed, state: this.state });
  }

  private findFirstMatching(
    lines: readonly string[],
    ex: BlockExtractor,
    from: number,
  ): number {
    for (let i = Math.max(0, from); i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (!matches(ex.start, line)) continue;
      if (ex.excludeStart && matches(ex.excludeStart, line)) continue;
      return i;
    }
    return -1;
  }

  private findLastMatching(
    lines: readonly string[],
    ex: BlockExtractor,
    from: number,
  ): number {
    for (let i = lines.length - 1; i >= Math.max(0, from); i -= 1) {
      const line = lines[i] ?? '';
      if (!matches(ex.start, line)) continue;
      if (ex.excludeStart && matches(ex.excludeStart, line)) continue;
      return i;
    }
    return -1;
  }

  private applyStateUpdate(update: Partial<ParserState>): void {
    for (const [k, v] of Object.entries(update)) {
      (this.state as unknown as Record<string, unknown>)[k] = v;
    }
  }
}

/** Strip the leading marker glyph and one space from a starter line.
 *  The starter line carries the first chunk of payload after the
 *  marker, so we keep it but peel the marker. */
function stripStarterMarker(line: string, marker: string): string {
  if (marker === 'assistantStart') return line.replace(/^\s*[⏺●]\s*/u, '');
  if (marker === 'reasoningStart') {
    // For `✻ Thinking…` we drop the entire line (the verb itself isn't
    // content); the reasoning extractor's transforms re-handle this.
    return '';
  }
  return line;
}
