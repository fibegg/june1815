/**
 * Public TuiParser façade.
 *
 * Delegates to the centralized engine in `./tui/`. This file exists for
 * backwards compatibility — every old consumer (Conversation, tests)
 * keeps importing `TuiParser` and `TuiEvent` from here. New code can
 * import the same names from `./tui` directly.
 *
 * To change parsing behavior, edit `./tui/markers.ts` (line patterns)
 * or `./tui/extractors.ts` (which lines become which events). The code
 * below does not contain parsing logic.
 */

import { TuiEngine } from './tui/engine.js';
import { MARKERS, type MarkerName } from './tui/markers.js';
import { computeDelta as engineComputeDelta } from './tui/transforms.js';
import type { TerminalSnapshot } from './terminal.js';
import type { TuiEvent } from './tui/types.js';

export type { TuiEvent };
export { MARKERS } from './tui/markers.js';

/** Legacy `TuiPatterns` shape kept so existing tests and consumers
 *  that asked for `DEFAULT_PATTERNS.<name>` keep working. New code
 *  should reference `MARKERS` directly. */
export interface TuiPatterns {
  readonly readyMarker: RegExp;
  readonly assistantBlockStart: RegExp;
  readonly reasoningBlockStart: RegExp;
  readonly blockEnd: RegExp;
  readonly toolCallLine: RegExp;
  readonly usageLine: RegExp;
  readonly permissionPrompt: RegExp;
  readonly oauthUrl: RegExp;
  readonly trustPrompt: RegExp;
  readonly busyFooter: RegExp;
}

const LEGACY_MAP: Record<keyof TuiPatterns, MarkerName> = {
  readyMarker: 'readyFooter',
  assistantBlockStart: 'assistantStart',
  reasoningBlockStart: 'reasoningStart',
  // `blockEnd` is no longer used by the engine (each extractor owns its
  // own stop set). Kept here as a union of the legacy patterns so tests
  // that ask `DEFAULT_PATTERNS.blockEnd.test(...)` still get a sensible
  // answer.
  blockEnd: 'divider',
  toolCallLine: 'toolCall',
  usageLine: 'usageLine',
  permissionPrompt: 'permissionDialog',
  oauthUrl: 'oauthUrl',
  trustPrompt: 'trustPrompt',
  busyFooter: 'busyFooter',
};

export const DEFAULT_PATTERNS: TuiPatterns = Object.freeze({
  readyMarker: MARKERS[LEGACY_MAP.readyMarker].pattern,
  assistantBlockStart: MARKERS[LEGACY_MAP.assistantBlockStart].pattern,
  reasoningBlockStart: MARKERS[LEGACY_MAP.reasoningBlockStart].pattern,
  blockEnd: MARKERS[LEGACY_MAP.blockEnd].pattern,
  toolCallLine: MARKERS[LEGACY_MAP.toolCallLine].pattern,
  usageLine: MARKERS[LEGACY_MAP.usageLine].pattern,
  permissionPrompt: MARKERS[LEGACY_MAP.permissionPrompt].pattern,
  oauthUrl: MARKERS[LEGACY_MAP.oauthUrl].pattern,
  trustPrompt: MARKERS[LEGACY_MAP.trustPrompt].pattern,
  busyFooter: MARKERS[LEGACY_MAP.busyFooter].pattern,
});

/**
 * The public parser. Holds an engine instance; every method is a
 * one-line delegation. Tests poke this through the same surface as
 * production code.
 */
export class TuiParser {
  private readonly engine: TuiEngine;

  constructor(_patterns: TuiPatterns = DEFAULT_PATTERNS) {
    // The patterns argument is accepted for source compat with the
    // pre-refactor API but ignored — there is one source of truth now
    // (`markers.ts`). Tests that wanted to swap patterns should test
    // markers/extractors directly.
    void _patterns;
    this.engine = new TuiEngine();
  }

  reset(): void {
    this.engine.reset();
  }

  markTurnStarted(): void {
    this.engine.markTurnStarted();
  }

  /** Back-compat alias. */
  resetTurn(): void {
    this.engine.markTurnStarted();
  }

  parse(snap: TerminalSnapshot): TuiEvent[] {
    return this.engine.parse(snap);
  }
}

/** Back-compat helpers used by older unit tests. New tests should import
 *  directly from `./tui/transforms.js`. */
export const __test = {
  computeDelta: engineComputeDelta,
};
