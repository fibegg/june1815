import { matches, MARKERS, type MarkerName } from './markers.js';
import {
  collapseBlankRuns,
  computeDelta,
  stripKnownPrefix,
  trimEdgeBlanks,
  trimRightPerLine,
} from './transforms.js';
import type { ParserState, TuiEvent } from './types.js';

/**
 * A block extractor is the smallest declarative unit the engine knows.
 * Each one anchors on a start-marker line, reads forward until it hits
 * one of `stops` (skipping lines that match `skips`), runs the
 * collected lines through `transforms`, and asks `emit` for the events
 * to publish + the state mutations to record.
 *
 * Adding a new event type = add one `BlockExtractor` here.
 * Tweaking behavior for a new claude-cli version = change `start` /
 * `stops` / `skips`.
 */
export interface BlockExtractor {
  /** Unique name. Used in debug logs and tests. */
  readonly name: string;
  /** Plain-English purpose. Documentation. */
  readonly purpose: string;
  /** When true, the extractor searches from line 0 instead of the
   *  current-turn anchor (used for trust dialog, OAuth URLs). */
  readonly ignoreAnchor?: boolean;
  /** Line that begins a block. */
  readonly start: MarkerName;
  /** When set, exclude any `start` line that ALSO matches this marker.
   *  e.g. assistant-text ignores `start: assistantStart` lines that
   *  match `toolCall` because tool calls are emitted separately. */
  readonly excludeStart?: MarkerName;
  /** When set, take the FIRST matching `start` line at or after the
   *  anchor; otherwise take the LAST. Most extractors take the first
   *  below the anchor; this flips the search direction. */
  readonly findLast?: boolean;
  /** Hard stops — any matching line ends the block. */
  readonly stops: readonly MarkerName[];
  /** Soft skips — matching lines are dropped from the block but the
   *  block continues. */
  readonly skips: readonly MarkerName[];
  /** Transforms applied to the collected line array in order. */
  readonly transforms: readonly ((lines: readonly string[]) => string[])[];
  /** Build events + state updates from the collected text. Returning
   *  empty arrays for both means "nothing to do this snapshot". */
  emit(input: {
    readonly text: string;
    readonly lines: readonly string[];
    readonly state: ParserState;
  }): { readonly events: readonly TuiEvent[]; readonly stateUpdate: Partial<ParserState> };
}

// -------------------------------------------------------------------------
//  Helpers shared by extractors
// -------------------------------------------------------------------------

function joinAndTrim(lines: readonly string[]): string {
  return lines.join('\n').trim();
}

const TEXT_PIPELINE = [trimRightPerLine, collapseBlankRuns, trimEdgeBlanks] as const;

// -------------------------------------------------------------------------
//  The extractor catalogue
// -------------------------------------------------------------------------

export const ASSISTANT_TEXT_EXTRACTOR: BlockExtractor = {
  name: 'assistant-text',
  purpose:
    'Extract the assistant response under the most recent user echo. Strips tool-call shapes, spinner lines, footer hints, prior-turn echoes, and tip blocks.',
  start: 'assistantStart',
  excludeStart: 'toolCall',
  stops: [
    'userEcho',
    'assistantStart',
    'reasoningStart',
    'turnSummary',
    'subordinate',
    'divider',
    'tipLine',
    'usageLine',
    'readyFooter',
    'busyFooter',
    'mcpFailureLine',
  ],
  skips: ['spinnerLine'],
  transforms: TEXT_PIPELINE,
  emit({ text, state }) {
    // Defensive subtraction: when claude renders two turns on the same
    // buffer row, the new response can start with the previous turn's
    // final text. Strip it.
    const cleaned = stripKnownPrefix(text, state.previousTurnFinalText);
    const delta = computeDelta(state.emittedAssistantText, cleaned);
    if (cleaned.length === 0 || delta.length === 0) {
      return { events: [], stateUpdate: {} };
    }
    return {
      events: [{ type: 'text_delta', text: delta }],
      stateUpdate: {
        emittedAssistantText: cleaned,
        turnHadActivity: true,
      },
    };
  },
};

export const REASONING_EXTRACTOR: BlockExtractor = {
  name: 'reasoning',
  purpose:
    'Extract active-tense reasoning content (`✻ Thinking…` + body lines below). Emits ONLY when there is real content below the marker, never on the marker alone.',
  start: 'reasoningStart',
  stops: [
    'userEcho',
    'assistantStart',
    'reasoningStart',
    'turnSummary',
    'subordinate',
    'divider',
    'tipLine',
    'usageLine',
    'readyFooter',
    'busyFooter',
    'mcpFailureLine',
  ],
  skips: ['spinnerLine'],
  transforms: [
    // Drop the leading verb line; only content survives.
    (lines) => (lines.length > 0 ? lines.slice(1) : []),
    trimRightPerLine,
    trimEdgeBlanks,
  ],
  emit({ text, state }) {
    if (text.length === 0) return { events: [], stateUpdate: {} };
    const delta = computeDelta(state.emittedReasoning, text);
    if (delta.length === 0) return { events: [], stateUpdate: {} };
    return {
      events: [{ type: 'reasoning_delta', text: delta }],
      stateUpdate: { emittedReasoning: text, turnHadActivity: true },
    };
  },
};

// -------------------------------------------------------------------------
//  Single-line extractors (don't extract a block; one-line classifiers)
// -------------------------------------------------------------------------

export interface LineExtractor {
  readonly name: string;
  readonly purpose: string;
  /** Walk every line in scope and return events + state updates. */
  apply(input: {
    readonly lines: readonly string[];
    readonly state: ParserState;
    readonly anchor: number;
  }): { readonly events: readonly TuiEvent[]; readonly stateUpdate: Partial<ParserState> };
}

/** Determine the most recent footer state. When both footers appear in
 *  the buffer (old one stuck in scrollback, new one at the bottom),
 *  position-priority wins: the LAST matching line decides. */
function currentFooter(lines: readonly string[]): 'ready' | 'busy' | 'unknown' {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (matches('busyFooter', line)) return 'busy';
    if (matches('readyFooter', line)) return 'ready';
  }
  return 'unknown';
}

export const READY_LINE_EXTRACTOR: LineExtractor = {
  name: 'ready-and-turn-complete',
  purpose:
    'Detect end-of-turn from any reliable signal: ready footer return, busy→ready transition, or a past-tense `✻ Verbed for Ns` summary line. Also emits the cross-turn `ready` event.',
  apply({ lines, state, anchor }) {
    const footer = currentFooter(lines);
    const trustVisible = lines.some((l) => matches('trustPrompt', l));
    // Only count a past-tense summary if it's BELOW the current turn's
    // anchor. Previous-turn summaries linger in the buffer and would
    // otherwise immediately fire turn_complete on the next turn.
    let turnSummaryVisible = false;
    for (let i = anchor; i < lines.length; i += 1) {
      if (matches('turnSummary', lines[i] ?? '')) {
        turnSummaryVisible = true;
        break;
      }
    }
    const events: TuiEvent[] = [];
    const update: Partial<ParserState> = {};

    if (process.env.JUNE15_DEBUG_TUI === '1') {
      console.error(
        `[ready-ex] footer=${footer} inTurn=${state.inTurn} hadAct=${state.turnHadActivity} lastFooter=${state.lastFooter} sawBusy=${state.sawBusyInTurn} summary=${turnSummaryVisible}`,
      );
    }
    if (footer === 'ready' && !trustVisible && !state.readyEmitted) {
      events.push({ type: 'ready' });
      update.readyEmitted = true;
    }

    // Latch: remember we observed a busy footer during this turn.
    if (footer === 'busy') update.sawBusyInTurn = true;
    if (footer !== 'unknown') update.lastFooter = footer;

    // `turn_complete` fires when ANY of the following holds:
    //   (a) Current footer is `ready` AND we previously saw `busy`
    //       (the canonical busy → ready transition).
    //   (b) Current footer is `ready` AND we have activity — covers
    //       cases where the busy footer rendered too briefly.
    //   (c) Last observed footer was `ready`, we saw `busy` earlier,
    //       AND we have activity — covers cases where a later snapshot
    //       stops matching the ready footer (xterm cursor-right escapes
    //       leaving zero-width content, scrollback dropping the footer
    //       row, …) but we know the transition already happened.
    //   (d) A past-tense `✻ Verbed for Ns` summary line BELOW the
    //       current turn's anchor is visible AND we have activity —
    //       claude only renders that line after the turn is finished,
    //       even on API-error turns where the footer never reaches our
    //       visible buffer. We require below-anchor + activity to avoid
    //       false-firing on a previous turn's leftover summary.
    const sawBusy = state.sawBusyInTurn || footer === 'busy' || update.sawBusyInTurn === true;
    const atReadyNow = footer === 'ready';
    const lastWasReady = state.lastFooter === 'ready' || update.lastFooter === 'ready';
    const transitionedToReady =
      (atReadyNow && (sawBusy || state.turnHadActivity)) ||
      (lastWasReady && sawBusy && state.turnHadActivity) ||
      (turnSummaryVisible && state.turnHadActivity);
    if (state.inTurn && transitionedToReady) {
      events.push({ type: 'turn_complete' });
    }
    return { events, stateUpdate: update };
  },
};

export const API_ERROR_EXTRACTOR: LineExtractor = {
  name: 'api-error',
  purpose:
    'Emit `error` events for `⎿ API Error:` / `⎿ Error:` lines. Dedups across the turn so a repeated render doesn\'t double-fire.',
  apply({ lines, state }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.emittedErrors);
    for (const line of lines) {
      const m = MARKERS.apiErrorLine.pattern.exec(line);
      if (!m?.[1]) continue;
      const message = m[1].trim();
      if (next.has(message)) continue;
      next.add(message);
      events.push({
        type: 'error',
        code: 'claude_api_error',
        message,
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return {
      events,
      stateUpdate: { emittedErrors: next, turnHadActivity: true },
    };
  },
};

export const TOOL_RESULT_EXTRACTOR: LineExtractor = {
  name: 'tool-result',
  purpose:
    'Emit `tool_result` for `⎿ <Name> <summary>` lines (file reads, bash output, etc). Excludes `⎿ Tip:` and `⎿ API Error:`.',
  apply({ lines, state, anchor }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.announcedToolResults);
    for (let i = anchor; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const m = MARKERS.toolResultLine.pattern.exec(line);
      if (!m) continue;
      const sig = `${i}::${line.trim()}`;
      if (next.has(sig)) continue;
      next.add(sig);
      events.push({
        type: 'tool_result',
        name: m[1] ?? '',
        summary: (m[2] ?? '').trim(),
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return {
      events,
      stateUpdate: { announcedToolResults: next, turnHadActivity: true },
    };
  },
};

export const TRUST_PROMPT_EXTRACTOR: LineExtractor = {
  name: 'trust-prompt',
  purpose: 'Emit `trust_prompt` once when the workspace-trust dialog is visible.',
  apply({ lines, state }) {
    const trustVisible = lines.some((l) => matches('trustPrompt', l));
    if (trustVisible && !state.trustPromptEmitted) {
      return {
        events: [{ type: 'trust_prompt' }],
        stateUpdate: { trustPromptEmitted: true },
      };
    }
    if (!trustVisible && state.trustPromptEmitted) {
      return { events: [], stateUpdate: { trustPromptEmitted: false } };
    }
    return { events: [], stateUpdate: {} };
  },
};

export const TOOL_USE_EXTRACTOR: LineExtractor = {
  name: 'tool-use',
  purpose:
    'Walk every line; emit a `tool_use` per unique `⏺ Name(args)` shape. Dedup by line position + content.',
  apply({ lines, state, anchor }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.announcedTools);
    for (let i = anchor; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const m = MARKERS.toolCall.pattern.exec(line);
      if (!m) continue;
      const sig = `${i}::${line}`;
      if (next.has(sig)) continue;
      next.add(sig);
      const name = m[1] ?? '';
      const summary = m[2];
      events.push(
        summary && summary.length > 0
          ? { type: 'tool_use', name, summary }
          : { type: 'tool_use', name },
      );
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { announcedTools: next, turnHadActivity: true } };
  },
};

export const USAGE_LINE_EXTRACTOR: LineExtractor = {
  name: 'usage',
  purpose: 'Walk every line; emit `usage` once per unique (input,output) pair.',
  apply({ lines, state }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.emittedUsage);
    for (const line of lines) {
      const m = MARKERS.usageLine.pattern.exec(line);
      if (!m) continue;
      const sig = `${m[1]}/${m[2]}`;
      if (next.has(sig)) continue;
      next.add(sig);
      events.push({
        type: 'usage',
        inputTokens: Number(m[1] ?? '0'),
        outputTokens: Number(m[2] ?? '0'),
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedUsage: next } };
  },
};

export const OAUTH_URL_EXTRACTOR: LineExtractor = {
  name: 'oauth-url',
  purpose: 'Emit `auth_required` when an OAuth URL appears in any line.',
  apply({ lines, state }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.emittedAuthUrl);
    for (const line of lines) {
      const m = MARKERS.oauthUrl.pattern.exec(line);
      if (!m?.[1]) continue;
      if (next.has(m[1])) continue;
      next.add(m[1]);
      events.push({ type: 'auth_required', url: m[1] });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedAuthUrl: next } };
  },
};

export const PERMISSION_DIALOG_EXTRACTOR: LineExtractor = {
  name: 'permission-dialog',
  purpose:
    'Emit `permission_prompt` for STRICT-shape permission dialogs only. Tip lines containing `Run` / `?` do NOT match.',
  apply({ lines, state }) {
    const events: TuiEvent[] = [];
    const next = new Set(state.emittedPermission);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!matches('permissionDialog', trimmed)) continue;
      if (next.has(trimmed)) continue;
      next.add(trimmed);
      events.push({ type: 'permission_prompt', question: trimmed });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedPermission: next } };
  },
};

// -------------------------------------------------------------------------
//  Registry — order matters; the engine runs them in this order.
// -------------------------------------------------------------------------

export const BLOCK_EXTRACTORS: readonly BlockExtractor[] = Object.freeze([
  ASSISTANT_TEXT_EXTRACTOR,
  REASONING_EXTRACTOR,
]);

export const LINE_EXTRACTORS: readonly LineExtractor[] = Object.freeze([
  TRUST_PROMPT_EXTRACTOR,
  API_ERROR_EXTRACTOR,
  TOOL_USE_EXTRACTOR,
  TOOL_RESULT_EXTRACTOR,
  USAGE_LINE_EXTRACTOR,
  OAUTH_URL_EXTRACTOR,
  PERMISSION_DIALOG_EXTRACTOR,
  // Ready/turn_complete must run LAST so all activity-setting extractors
  // upstream have already updated state for the same snapshot.
  READY_LINE_EXTRACTOR,
]);

void joinAndTrim;
