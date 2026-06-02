/**
 * Centralized named line classifiers for the Claude Code TUI.
 *
 * Every regex that examines a single rendered TUI line lives here, with a
 * stable name. The parser engine and individual extractors reference
 * markers by name — they never literal-match strings or compile regexes
 * themselves. When Anthropic ships a new TUI revision:
 *
 *   1. Capture a fresh byte stream under `tests/fixtures/tui-recordings/`.
 *   2. Adjust the offending marker(s) here.
 *   3. The engine and extractors don't change.
 *
 * Calibrated against Claude Code v2.1.128 (macOS arm64) on 2026-05-14.
 */

export type MarkerName =
  | 'userEcho'
  | 'userEchoPlaceholder'
  | 'assistantStart'
  | 'toolCall'
  | 'reasoningStart'
  | 'turnSummary'
  | 'subordinate'
  | 'divider'
  | 'tipLine'
  | 'usageLine'
  | 'readyFooter'
  | 'busyFooter'
  | 'spinnerLine'
  | 'oauthUrl'
  | 'trustPrompt'
  | 'permissionDialog'
  | 'mcpFailureLine'
  | 'systemTipLine'
  | 'apiErrorLine'
  | 'toolResultLine'
  | 'onboardingPrompt';

export interface MarkerDef {
  readonly name: MarkerName;
  /** One-line description of what this matches. Shown in debug output. */
  readonly purpose: string;
  /** The regex that runs against a (ANSI-stripped) line. */
  readonly pattern: RegExp;
  /** If true, the line never anchors a content block — even if a downstream
   *  extractor would normally use the same marker as a start. Used to
   *  prevent `❯ Try "<placeholder>"` (the empty-input hint) from being
   *  mistaken for a real user message. */
  readonly isPlaceholderOnly?: boolean;
}

 
const NOOP = /a^/;
void NOOP;

const RAW: readonly Omit<MarkerDef, 'pattern'>[] & readonly unknown[] = [];
void RAW;

export const MARKERS: Readonly<Record<MarkerName, MarkerDef>> = Object.freeze({
  userEcho: {
    name: 'userEcho',
    purpose:
      "Echoed user message: `❯ <text>` where <text> isn't blank and isn't the `Try \"...\"` placeholder.",
    // We intentionally match BOTH placeholder and real echoes here; the
    // engine uses `userEchoPlaceholder` to subtract out the false ones.
    pattern: /^\s*❯\s+\S/u,
  },
  userEchoPlaceholder: {
    name: 'userEchoPlaceholder',
    purpose:
      'Empty-input box hint: `❯ Try "refactor <filepath>"`. Looks like a user echo but isn\'t one.',
    pattern: /^\s*❯\s+Try\s+["'<]/u,
    isPlaceholderOnly: true,
  },
  assistantStart: {
    name: 'assistantStart',
    purpose:
      'Start of an assistant response or tool-call: `⏺ <something>` (U+23FA BLACK CIRCLE FOR RECORD).',
    pattern: /^\s*⏺\s+/u,
  },
  toolCall: {
    name: 'toolCall',
    purpose: 'Tool-call rendering: `⏺ Name(args)`. Distinguishable from plain text by the parens.',
    pattern: /^\s*⏺\s+([A-Za-z][A-Za-z0-9_]*)\(([^)]*)\)/u,
  },
  reasoningStart: {
    name: 'reasoningStart',
    purpose:
      "In-flight reasoning marker: `✻ <verb>ing…` or `✻ <verb>ing...`. Excludes past-tense summaries.",
    pattern: /^\s*✻\s+[A-Za-z]+ing\s*(?:…|\.{3})/u,
  },
  turnSummary: {
    name: 'turnSummary',
    purpose:
      "Past-tense turn elapsed-time summary: `✻ Brewed for 2s`, `✻ Cogitated for 0s`, `✻ Sautéed for 1s`. Looks like reasoning but isn't.",
    pattern: /^\s*✻\s+\p{L}+ed\s+for\s+\d+s/u,
  },
  subordinate: {
    name: 'subordinate',
    purpose:
      'Nested/result block under another marker: `⎿ <content>`. Used for tool results, /permissions tips, system notes.',
    pattern: /^\s*⎿/u,
  },
  divider: {
    name: 'divider',
    purpose: 'Horizontal rule between TUI regions: `─` / `━` / `═` repeated 3+ times.',
    pattern: /^\s*[─━═]{3,}/u,
  },
  tipLine: {
    name: 'tipLine',
    purpose: 'Standalone tip text claude periodically renders: `Tip: <...>`.',
    pattern: /^\s*Tip:/iu,
  },
  usageLine: {
    name: 'usageLine',
    purpose:
      'Token-usage summary: `Usage: 123 in / 45 out`. Capture groups expose input/output counts.',
    pattern: /Usage:\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/iu,
  },
  readyFooter: {
    name: 'readyFooter',
    purpose:
      "Idle TUI footer. Default mode: `? for shortcuts`. Permission modes: `⏵⏵ bypass permissions on`, `⏵ accept edits`, `⏵ plan mode on`.",
    pattern: /\?\s*for\s*shortcuts|bypass\s*permissions\s*on|accept\s*edits|plan\s*mode\s*on/iu,
  },
  busyFooter: {
    name: 'busyFooter',
    purpose: 'In-flight TUI footer: `esc to interrupt …`.',
    pattern: /esc\s*to\s*interrupt/iu,
  },
  spinnerLine: {
    name: 'spinnerLine',
    purpose:
      "Rotating spinner glyph followed by a verb: `✢ Deciphering…`, `· Simmering…`, `⠋ Loading…`. Decoration only, never content.",
    pattern: /^\s*[✢✳✶✻✽⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏·]\s+\S/u,
  },
  oauthUrl: {
    name: 'oauthUrl',
    purpose: 'OAuth login URL emitted during `claude auth login`.',
    pattern: /(https?:\/\/[^\s]*claude\.ai[^\s]*)/iu,
  },
  trustPrompt: {
    name: 'trustPrompt',
    purpose:
      'Workspace-trust dialog shown on first entry into an unfamiliar directory.',
    pattern: /Quick\s*safety\s*check|trust\s*this\s*folder/iu,
  },
  permissionDialog: {
    name: 'permissionDialog',
    purpose:
      "Tool-permission dialog. Strict shape — must include an action verb at word boundary AND a `?` AND an answer prompt like `(y/N)`, `[Y/n]`, `yes/no`, or `always`.",
    pattern: /\b(?:allow|approve|confirm)\b[^?]*\?\s*(?:\(|\[|yes\b|y\/n|y\s*\/\s*n|always)/iu,
  },
  mcpFailureLine: {
    name: 'mcpFailureLine',
    purpose: 'Footer notice about failed MCP servers: `3 MCP servers failed · /mcp`.',
    pattern: /^\s*\d+\s*MCP\s*servers/iu,
  },
  systemTipLine: {
    name: 'systemTipLine',
    purpose:
      'System-emitted tip rendered under a `⎿`: `⎿  Tip: Use /permissions to ...`. Subset of `subordinate` and `tipLine`.',
    pattern: /^\s*⎿\s*Tip:/iu,
  },
  apiErrorLine: {
    name: 'apiErrorLine',
    purpose:
      'API error surfaced as a subordinate line: `⎿  API Error: 400 {...}` or `⎿  Error: <msg>`. Capture group 1 is the message.',
    pattern: /⎿\s*(?:API\s*Error|Error):\s*(.+)$/iu,
  },
  toolResultLine: {
    name: 'toolResultLine',
    purpose:
      'Tool/file-read result under a `⎿`: `⎿ Read /path/to/file (83 bytes)`. Distinct from `apiErrorLine` and `systemTipLine`.',
    pattern: /^\s*⎿\s+(?!Tip:|API\s*Error|Error)([A-Za-z][\w-]*)\s+(.+)$/u,
  },
  onboardingPrompt: {
    name: 'onboardingPrompt',
    purpose:
      "First-run onboarding gate that blocks the chat-ready footer and which the parser cannot drive: the theme picker (`Choose the text style…`), the model-effort picker (`Effort lets you control the tradeoff…`), or the generic `Let's get started.` splash. Calibrated against Claude Code 2.1.x first-run flow.",
    pattern: /choose the text style|let'?s get started|effort lets you control/iu,
  },
});

/**
 * Test whether a line matches a marker. Centralized so call sites read as
 * `matches('userEcho', line)` rather than embedding regexes.
 */
export function matches(name: MarkerName, line: string): boolean {
  return MARKERS[name].pattern.test(line);
}

/**
 * Capture variants for markers whose regex has groups. Returns the raw
 * RegExp match result or null. Callers use this when they need group
 * data (tool name + args, usage counts, OAuth URL).
 */
export function capture(name: MarkerName, line: string): RegExpExecArray | null {
  return MARKERS[name].pattern.exec(line);
}
