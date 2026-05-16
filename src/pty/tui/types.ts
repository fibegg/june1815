/**
 * Public event vocabulary the TUI parser emits to its consumer
 * (Conversation). Mirrors `src/server/events.ts` plus the
 * `trust_prompt` internal-only signal that the Conversation auto-handles.
 */

export type TuiEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'reasoning_delta'; readonly text: string }
  | { readonly type: 'tool_use'; readonly name: string; readonly summary?: string }
  | { readonly type: 'tool_result'; readonly name: string; readonly summary: string }
  | { readonly type: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: 'turn_complete' }
  | { readonly type: 'auth_required'; readonly url: string }
  | { readonly type: 'permission_prompt'; readonly question: string }
  | { readonly type: 'trust_prompt' }
  | { readonly type: 'error'; readonly code: string; readonly message: string };

/**
 * State carried across `parse()` calls. Each high-water mark prevents an
 * already-emitted region from being re-emitted as the same byte stream
 * keeps arriving.
 *
 * Per-turn state (assistant text, reasoning, tool sigs) is reset by
 * `markTurnStarted()`. Cross-turn state (ready flag, OAuth URLs,
 * permission texts) persists.
 */
export interface ParserState {
  emittedAssistantText: string;
  emittedReasoning: string;
  /** Signatures of already-emitted tool calls within the current turn. */
  announcedTools: Set<string>;
  /** Cross-turn dedup of usage rows (paired counts). */
  emittedUsage: Set<string>;
  /** Cross-turn dedup of permission prompt texts. */
  emittedPermission: Set<string>;
  /** Cross-turn dedup of OAuth URLs. */
  emittedAuthUrl: Set<string>;
  /** Whether `ready` has been emitted at least once. Latches. */
  readyEmitted: boolean;
  /** Whether the trust dialog was visible in the most recent snapshot. */
  trustPromptEmitted: boolean;
  /** Whether the current turn has had any visible activity yet. */
  inTurn: boolean;
  turnHadActivity: boolean;
  /**
   * The footer we saw in the previous snapshot. Drives `turn_complete`:
   * when this flips from `busy` to `ready`, the turn is over regardless
   * of whether any content was captured (e.g. an API-error turn produces
   * no `⏺ <text>` but still completes).
   */
  lastFooter: 'ready' | 'busy' | 'unknown';
  /**
   * Latches when `footer === 'busy'` is observed during the current turn.
   * Reset in `markTurnStarted()`. Combined with `lastFooter === 'ready'`
   * it lets us fire `turn_complete` even when the *current* snapshot
   * happens to render the footer in an unrecognised way (e.g. xterm
   * cursor-right escapes producing zero-width content). Without this,
   * brief flickers between busy → ready → unknown can leave a turn stuck.
   */
  sawBusyInTurn: boolean;
  /** Signatures of already-emitted tool-result lines (current turn). */
  announcedToolResults: Set<string>;
  /** Cross-turn dedup of API-error messages. */
  emittedErrors: Set<string>;
  /** The user-echo line text that anchored the current turn's
   *  assistant search. Stored so that, if a multi-turn render
   *  concatenates the previous response onto the current line, we can
   *  subtract the previous text payload. */
  currentTurnAnchorLine: string;
  /** The most recent fully-resolved assistant text from the PREVIOUS
   *  turn. Used to subtract concatenated prefixes. */
  previousTurnFinalText: string;
}

export function initialParserState(): ParserState {
  return {
    emittedAssistantText: '',
    emittedReasoning: '',
    announcedTools: new Set(),
    emittedUsage: new Set(),
    emittedPermission: new Set(),
    emittedAuthUrl: new Set(),
    readyEmitted: false,
    trustPromptEmitted: false,
    inTurn: false,
    turnHadActivity: false,
    currentTurnAnchorLine: '',
    previousTurnFinalText: '',
    lastFooter: 'unknown',
    sawBusyInTurn: false,
    announcedToolResults: new Set(),
    emittedErrors: new Set(),
  };
}
