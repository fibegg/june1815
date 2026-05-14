import {
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
  | { readonly type: 'permission_prompt'; readonly question: string }
  | { readonly type: 'trust_prompt' };

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
  /** Match the workspace-trust dialog claude shows on first entry into a
   *  directory it doesn't yet trust. */
  readonly trustPrompt: RegExp;
  /** Match the footer line that signals a turn is running and can be
   *  interrupted with ESC (the "busy" footer in Claude Code v2+). */
  readonly busyFooter: RegExp;
}

// Calibrated against Claude Code v2.1.128 TUI output captured on macOS
// arm64. Update when Anthropic ships a new UI revision; the parser logic
// itself doesn't change.
export const DEFAULT_PATTERNS: TuiPatterns = Object.freeze({
  // The ready state is signalled by the footer hint line, NOT by the
  // input chevron — that line also appears mid-turn. Claude's footer
  // can read either:
  //   `? for shortcuts ● <effort> · /effort`             (default mode)
  //   `⏵⏵ bypass permissions on (shift+tab to cycle) …`  (bypass mode)
  //   `⏵ accept edits …` / `⏵ plan mode on …`            (other modes)
  // Either signals an idle TUI ready to accept input. Whitespace is
  // collapsed in narrow xterm cells so we use `\s*` between tokens.
  readyMarker: /\?\s*for\s*shortcuts|bypass\s*permissions\s*on|accept\s*edits|plan\s*mode\s*on/iu,
  // Assistant text and tool calls both use the `⏺` (U+23FA, BLACK
  // CIRCLE FOR RECORD) marker at the start of the rendered line.
  // We disambiguate at the parser level: a `Name(args)` immediately
  // after the marker is a tool call; bare text is assistant content.
  assistantBlockStart: /^\s*⏺\s+/u,
  // Real reasoning content starts with an active-tense verb followed by an
  // ellipsis: `✻ Thinking…`, `✻ Cogitating…`. Past-tense turn-summary
  // lines like `✻ Brewed for 2s` / `✻ Cogitated for 0s` are NOT reasoning
  // — they're just elapsed-time markers — so we require the `…` (or `...`)
  // suffix to anchor.
  reasoningBlockStart: /^\s*✻\s+[A-Za-z]+ing\s*(?:…|\.{3})/u,
  blockEnd: /^\s*[─━═]{3,}|^\s*[│┃║]\s*>\s|^\s*Usage:/u,
  toolCallLine: /^\s*⏺\s+([A-Za-z][A-Za-z0-9_]*)\(([^)]*)\)/u,
  usageLine: /Usage:\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/iu,
  // A real permission dialog looks like:
  //   `Allow Claude to run this command? (y/N)`
  //   `Approve edit to <path>? [yes / no / always]`
  // Require: an action word at word-boundary AND a `?` AND an explicit
  // answer-style suffix like `(y/N)`, `[Y/n]`, `yes/no`, or `Yes,` so
  // we don't grab `Tip:` lines that incidentally contain "Run" / "?".
  permissionPrompt:
    /\b(?:allow|approve|confirm)\b[^?]*\?\s*(?:\(|\[|yes\b|y\/n|y\s*\/\s*n|always)/iu,
  oauthUrl: /(https?:\/\/[^\s]*claude\.ai[^\s]*)/iu,
  trustPrompt: /Quick\s*safety\s*check|trust\s*this\s*folder/iu,
  busyFooter: /esc\s*to\s*interrupt/iu,
});

interface ParserState {
  emittedAssistantText: string;
  emittedReasoning: string;
  announcedTools: Set<string>;
  emittedUsage: Set<string>;
  emittedPermission: Set<string>;
  emittedAuthUrl: Set<string>;
  readyEmitted: boolean;
  trustPromptEmitted: boolean;
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
    trustPromptEmitted: false,
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

    // -- Trust dialog detection (precedes ready on first entry to a cwd) --
    const trustVisible = lines.some((l) => this.patterns.trustPrompt.test(l));
    if (trustVisible && !this.state.trustPromptEmitted) {
      events.push({ type: 'trust_prompt' });
      this.state.trustPromptEmitted = true;
    }
    // If the dialog is gone but we'd previously seen it, reset so a future
    // dialog (different cwd) is re-emitted.
    if (!trustVisible && this.state.trustPromptEmitted) {
      this.state.trustPromptEmitted = false;
    }

    // -- Ready detection ----------------------------------------------------
    const readyVisible = lines.some((l) => this.patterns.readyMarker.test(l));
    const busyVisible = lines.some((l) => this.patterns.busyFooter.test(l));
    if (readyVisible && !busyVisible && !trustVisible && !this.state.readyEmitted) {
      events.push({ type: 'ready' });
      this.state.readyEmitted = true;
    }

    // -- OAuth URL (auth_required) ----------------------------------------
    for (const line of lines) {
      const m = this.patterns.oauthUrl.exec(line);
      if (m?.[1] && !this.state.emittedAuthUrl.has(m[1])) {
        this.state.emittedAuthUrl.add(m[1]);
        events.push({ type: 'auth_required', url: m[1] });
      }
    }

    // -- Assistant text -----------------------------------------------------
    // The Claude TUI lays each turn out as:
    //     ❯ <user message>          (echoed user)
    //     ⏺ <assistant response>    (one or more lines)
    //     ✻ <verb> for Ns           (turn summary)
    // The buffer accumulates ALL prior turns, so we anchor on the LAST
    // `❯ <text>` (the most recent user echo that has actual content —
    // an empty `❯` is the placeholder input box). The current response
    // is the FIRST `⏺ <text>` line below that anchor, excluding
    // tool-call shapes (`⏺ Name(args)`).
    const userEchoIdx = findLastLineIndex(lines, (l) => isUserEchoLine(l));
    const searchFrom = Math.max(0, userEchoIdx + 1);
    const assistantIdx = findLineIndex(
      lines,
      (l) =>
        this.patterns.assistantBlockStart.test(l) && !this.patterns.toolCallLine.test(l),
      searchFrom,
    );
    if (assistantIdx >= 0) {
      const block = collectAssistantBlock(lines, assistantIdx, snap.cursorY);
      const text = block.join('\n').trim();
      const delta = computeDelta(this.state.emittedAssistantText, text);
      if (delta.length > 0 && text.length > 0) {
        events.push({ type: 'text_delta', text: delta });
        this.state.emittedAssistantText = text;
        this.state.turnHadActivity = true;
      }
    }

    // -- Reasoning ---------------------------------------------------------
    // Only the in-flight reasoning marker (`✻ Thinking…` etc.) is
    // interesting; the past-tense summary (`✻ Brewed for 2s`) and the
    // spinner status (`✢ Crunching…`) are NOT reasoning content. We
    // search *below the last user echo* to avoid resurrecting a prior
    // turn's reasoning marker, and we only emit when there's actual
    // non-marker content below the marker line.
    const reasoningIdx = findLineIndex(
      lines,
      (l) => this.patterns.reasoningBlockStart.test(l),
      searchFrom,
    );
    if (reasoningIdx >= 0) {
      const block = collectAssistantBlock(lines, reasoningIdx, snap.cursorY);
      // Drop the leading verb line — its `✻ Thinking…` form is just a
      // marker, not content. Anything that survives is real reasoning.
      const inner = block.slice(1).filter((l) => l.trim().length > 0);
      const text = inner.join('\n').trim();
      const delta = computeDelta(this.state.emittedReasoning, text);
      if (delta.length > 0 && text.length > 0) {
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
    // The footer flips from `esc to interrupt` back to `? for shortcuts`
    // when claude finishes the turn. We also require some recorded
    // activity so we don't emit on the initial ready-state appearance.
    if (this.state.inTurn && readyVisible && !busyVisible && this.state.turnHadActivity) {
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
  const out: string[] = [trimTrailingWs(firstContent)];
  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (blockEnd.test(line)) break;
    if (nextBlockStart.test(line)) break;
    // Skip the spinner / status decoration line that claude renders below
    // the assistant content while a turn is in flight.
    if (isSpinnerOrFooter(line)) continue;
    out.push(trimTrailingWs(line));
  }
  return trimTrailingEmpty(out);
}

function trimTrailingWs(s: string): string {
  return s.replace(/[ \t]+$/u, '');
}

/** A user-echo line: `❯ <something non-empty>`. The empty input
 *  placeholder `❯` (followed by spaces or "Try …" tip text) is NOT a
 *  user message and must not anchor our assistant search — those lines
 *  return false here. */
function isUserEchoLine(line: string): boolean {
  const m = /^\s*❯\s*(.*?)\s*$/u.exec(line);
  if (!m) return false;
  const content = m[1] ?? '';
  if (content.length === 0) return false;
  // The default empty-input hint reads `Try "<something>"`.
  if (/^Try\s+["'<]/u.test(content)) return false;
  return true;
}

/** Hard stops that end an assistant block. Any line whose trimmed prefix
 *  matches one of these means "we've left the response region": next
 *  user turn, reasoning summary, subordinate/help content, divider,
 *  footer hints, usage totals. */
const ASSISTANT_STOP_PREFIXES: readonly RegExp[] = Object.freeze([
  /^❯\s/u,
  /^⏺\s/u,           // another assistant block (different turn / steer)
  /^✻\s/u,           // turn-summary marker (`✻ Brewed for 2s`)
  /^⎿/u,             // subordinate/help/result line (tool output, /permissions tips, ...)
  /^[─━═]{3,}/u,
  /^Tip:/iu,
  /^Usage:/iu,
  /\?\s*for\s*shortcuts/iu,
  /esc\s*to\s*interrupt/iu,
  /^\d+\s*MCP\s*servers/iu,
]);

const ASSISTANT_SKIP_PREFIXES: readonly RegExp[] = Object.freeze([
  // Spinner glyphs claude rotates (✢✳✶✻✽ + braille + middle-dot)
  /^[✢✳✶✻✽⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏·]\s/u,
]);

/** Extract the assistant response that begins at `lines[startIdx]`
 *  (a line matching `⏺ <text>`). Reads forward until hitting any
 *  ASSISTANT_STOP_PREFIXES line or `cursorY` (the upper bound — the
 *  response cannot extend past where claude is currently writing).
 *  Spinner/decoration lines are skipped (they're not response content).
 *  Trailing blank lines are trimmed.
 */
function collectAssistantBlock(
  lines: readonly string[],
  startIdx: number,
  cursorY: number,
): string[] {
  const start = lines[startIdx] ?? '';
  const firstContent = trimTrailingWs(start.replace(/^\s*⏺\s*/u, ''));
  const out: string[] = [];
  if (firstContent.length > 0) out.push(firstContent);

  const upperBound = Math.max(cursorY + 1, startIdx + 1);
  const stop = (line: string): boolean => {
    const t = line.trim();
    return t.length > 0 && ASSISTANT_STOP_PREFIXES.some((re) => re.test(t));
  };
  const skip = (line: string): boolean =>
    ASSISTANT_SKIP_PREFIXES.some((re) => re.test(line.trim()));

  for (let i = startIdx + 1; i < lines.length && i < upperBound + 100; i += 1) {
    const line = lines[i] ?? '';
    if (stop(line)) break;
    if (skip(line)) continue;
    out.push(trimTrailingWs(line));
  }

  while (out.length > 0 && (out[out.length - 1] ?? '').trim().length === 0) out.pop();
  return out;
}

// Spinner glyphs claude rotates through (✢ ✳ ✶ ✻ ✽ ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏) plus
// the inline status line shape `<glyph> <verb>… (Ns · ↓ N tokens)` and the
// footer hint lines. Excluded from the assistant block so they don't leak
// into text_delta payloads.
const SPINNER_OR_FOOTER_RE =
  /^\s*[✢✳✶✻✽⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+\S/u;
const FOOTER_HINT_RE =
  /^\s*(?:\?\s*for\s*shortcuts|esc\s*to\s*interrupt|\d+\s*MCP\s*servers)/iu;

function isSpinnerOrFooter(line: string): boolean {
  if (SPINNER_OR_FOOTER_RE.test(line)) return true;
  if (FOOTER_HINT_RE.test(line)) return true;
  return false;
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
