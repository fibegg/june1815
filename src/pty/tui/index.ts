/**
 * The centralized Claude TUI parser.
 *
 * Public surface — anything importing from `@/pty/tui` reads here.
 *
 * Architecture:
 *
 *   `markers.ts`     — every regex that matches a single line, named.
 *   `transforms.ts`  — pure text post-processors (trim, dedup, etc.).
 *   `anchoring.ts`   — "where does the current turn start?" logic.
 *   `extractors.ts`  — declarative configs: one per event type.
 *   `engine.ts`      — runs the extractors against a snapshot.
 *   `types.ts`       — `TuiEvent`, `ParserState`.
 *
 * Touching parsing behavior is a one-file change: `markers.ts` for line
 * patterns, `extractors.ts` for which lines become which events.
 */

export { TuiEngine } from './engine.js';
export type { TuiEvent, ParserState } from './types.js';
export {
  MARKERS,
  matches,
  capture,
  type MarkerDef,
  type MarkerName,
} from './markers.js';
export {
  BLOCK_EXTRACTORS,
  LINE_EXTRACTORS,
  type BlockExtractor,
  type LineExtractor,
} from './extractors.js';
