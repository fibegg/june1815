import {
  extractBlock,
  findLastLineIndex,
  findLineIndex,
  stripAnsiLines,
  trimTrailingEmpty,
} from './ansi.js';
import type { TerminalSnapshot } from './terminal.js';

export type TuiEvent =
  | { readonly type: 'ready' }
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'reasoning_delta'; readonly text: string }
  | { readonly type: 'tool_use'; readonly name: string; readonly summary?: string }
  | { readonly type: 'usage'; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly type: 'turn_complete' }
  | { readonly type: 'auth_required'; readonly url: string }
  | { readonly type: 'permission_prompt'; readonly question: string };

/**
 * Patterns the parser uses to identify regions in the rendered TUI.
 * Externalized so the parser can be retargeted to future TUI revisions
 * without code changes.
 */
export interface TuiPatterns {
  /** Match a line that proves the TUI is at an idle prompt. */
  readonly readyMarker: RegExp;
  /** Match the start of an assistant-response block. */
  readonly assistantBlockStart: RegExp;
  /** Match the start of a reasoning/thinking block. */
  readonly reasoningBlockStart: RegExp;
  /** Match a line that terminates a content block (prompt, footer, divider). */
  readonly blockEnd: RegExp;
  /** Match a tool-call announcement. Capture #1 = tool name; capture #2 = summary. */
  readonly toolCallLine: RegExp;
  /** Match a usage/tokens footer. Capture #1 = input tokens; #2 = output. */
  readonly usageLine: RegExp;
  /** Match a permission prompt the operator must answer. */
  readonly permissionPrompt: RegExp;
  /** Match an OAuth URL inline. Capture #1 = URL. */
  readonly oauthUrl: RegExp;
}

export const DEFAULT_PATTERNS: TuiPatterns = Object.freeze({
  readyMarker: /^\s*[│┃║]\s*>\s/u,
  assistantBlockStart: /^\s*●\s+/u,
  reasoningBlockStart: /^\s*✻\s+(Thinking|Pondering|Reasoning)/iu,
  blockEnd: /^\s*[─━═]{3,}|^\s*[│┃║]\s*>\s|^\s*Usage:/u,
  toolCallLine: /^\s*⏺\s+([A-Za-z][A-Za-z0-9_]*)\(([^)]*)\)/u,
  usageLine: /Usage:\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/iu,
  permissionPrompt: /(allow|approve|run|continue|confirm).+[?](.|\s)*$/iu,
  oauthUrl: /(https?:\/\/[^\s]*claude\.ai[^\s]*)/iu,
});

interface ParserState {
  emittedAssistantText: string;
  emittedReasoning: string;
  announcedTools: Set<string>;
  emittedUsage: Set<string>;
  emittedPermission: Set<string>;
  emittedAuthUrl: Set<string>;
  readyEmitted: boolean;
  inTurn: boolean;
  turnHadActivity: boolean;
}

function initialState(): ParserState {
  return {
    emittedAssistantText: '',
    emittedReasoning: '',
    announcedTools: new Set(),
    emittedUsage: new Set(),
    emittedPermission: new Set(),
    emittedAuthUrl: new Set(),
    readyEmitted: false,
    inTurn: false,
    turnHadActivity: false,
  };
}

export class TuiParser {
  private state: ParserState = initialState();
  private readonly patterns: TuiPatterns;

  constructor(patterns: TuiPatterns = DEFAULT_PATTERNS) {
    this.patterns = patterns;
  }

  reset(): void {
    this.state = initialState();
  }

  /** Reset only the per-turn state. Used between consecutive user turns. */
  resetTurn(): void {
    this.state.emittedAssistantText = '';
    this.state.emittedReasoning = '';
    this.state.announcedTools = new Set();
    this.state.emittedPermission = new Set();
    this.state.turnHadActivity = false;
    this.state.inTurn = true;
  }

  /** Mark a new user turn as starting (clears per-turn state). */
  markTurnStarted(): void {
    this.resetTurn();
  }

  parse(snap: TerminalSnapshot): TuiEvent[] {
    const events: TuiEvent[] = [];
    const lines = stripAnsiLines(snap.lines);

    // -- Ready detection ----------------------------------------------------
    const readyVisible = lines.some((l) => this.patterns.readyMarker.test(l));
    if (readyVisible && !this.state.readyEmitted) {
      events.push({ type: 'ready' });
      this.state.readyEmitted = true;
    }

    // -- OAuth URL (auth_required) ----------------------------------------
    for (const line of lines) {
      const m = this.patterns.oauthUrl.exec(line);
      if (m && m[1] && !this.state.emittedAuthUrl.has(m[1])) {
        this.state.emittedAuthUrl.add(m[1]);
        events.push({ type: 'auth_required', url: m[1] });
      }
    }

    // -- Assistant text -----------------------------------------------------
    const assistantIdx = findLastLineIndex(lines, (l) =>
      this.patterns.assistantBlockStart.test(l),
    );
    if (assistantIdx >= 0) {
      const block = collectBlock(
        lines,
        assistantIdx,
        this.patterns.blockEnd,
        this.patterns.assistantBlockStart,
      );
      const text = block.join('\n').trim();
      const delta = computeDelta(this.state.emittedAssistantText, text);
      if (delta.length > 0) {
        events.push({ type: 'text_delta', text: delta });
        this.state.emittedAssistantText = text;
        this.state.turnHadActivity = true;
      }
    }

    // -- Reasoning ---------------------------------------------------------
    const reasoningIdx = findLineIndex(lines, (l) => this.patterns.reasoningBlockStart.test(l));
    if (reasoningIdx >= 0) {
      const block = collectBlock(
        lines,
        reasoningIdx,
        this.patterns.blockEnd,
        this.patterns.reasoningBlockStart,
      );
      const text = block.join('\n').trim();
      const delta = computeDelta(this.state.emittedReasoning, text);
      if (delta.length > 0) {
        events.push({ type: 'reasoning_delta', text: delta });
        this.state.emittedReasoning = text;
        this.state.turnHadActivity = true;
      }
    }

    // -- Tool calls -------------------------------------------------------
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      const m = this.patterns.toolCallLine.exec(line);
      if (!m) continue;
      const signature = `${i}::${line}`;
      if (this.state.announcedTools.has(signature)) continue;
      this.state.announcedTools.add(signature);
      const event: TuiEvent = m[2]
        ? { type: 'tool_use', name: m[1] ?? '', summary: m[2] }
        : { type: 'tool_use', name: m[1] ?? '' };
      events.push(event);
      this.state.turnHadActivity = true;
    }

    // -- Usage -------------------------------------------------------------
    for (const line of lines) {
      const m = this.patterns.usageLine.exec(line);
      if (!m) continue;
      const signature = `${m[1]}/${m[2]}`;
      if (this.state.emittedUsage.has(signature)) continue;
      this.state.emittedUsage.add(signature);
      events.push({
        type: 'usage',
        inputTokens: Number(m[1] ?? '0'),
        outputTokens: Number(m[2] ?? '0'),
      });
    }

    // -- Permission prompt (no auto-dedup besides exact match) -----------
    for (const line of lines) {
      const trimmed = line.trim();
      if (!this.patterns.permissionPrompt.test(trimmed)) continue;
      if (this.state.emittedPermission.has(trimmed)) continue;
      this.state.emittedPermission.add(trimmed);
      events.push({ type: 'permission_prompt', question: trimmed });
    }

    // -- Turn complete ----------------------------------------------------
    if (this.state.inTurn && readyVisible && this.state.turnHadActivity) {
      events.push({ type: 'turn_complete' });
      this.state.inTurn = false;
      this.state.turnHadActivity = false;
    }

    return events;
  }
}

/** Collect lines between a start marker (exclusive) and the next end marker
 *  (or end of input). Stops if a second start marker is encountered. Trims
 *  trailing empty lines. */
function collectBlock(
  lines: readonly string[],
  startIdx: number,
  blockEnd: RegExp,
  nextBlockStart: RegExp,
): string[] {
  const start = lines[startIdx] ?? '';
  // The starter line itself often contains the first chunk of content after
  // the marker. Keep that content.
  const firstContent = start.replace(/^\s*[●✻⏺]\s*/u, '').replace(/^\s*Thinking\.*\s*/iu, '');
  const out: string[] = [firstContent];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (blockEnd.test(line)) break;
    if (nextBlockStart.test(line)) break;
    out.push(line);
  }
  return trimTrailingEmpty(out);
}

/** Return the new tail of `current` that wasn't present in `prev`. Falls
 *  back to the full string if the new value doesn't extend the old one
 *  (e.g. the TUI re-rendered the block from scratch). */
function computeDelta(prev: string, current: string): string {
  if (current === prev) return '';
  if (current.startsWith(prev)) return current.slice(prev.length);
  return current;
}

export const __test = { computeDelta, collectBlock };
