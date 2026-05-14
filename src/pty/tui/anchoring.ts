import { matches } from './markers.js';

/**
 * Find the index of the most recent NON-PLACEHOLDER user echo line.
 * Returns -1 when no echo has appeared yet (initial state) or when the
 * buffer only contains the empty input box.
 *
 * This is the anchor for "where does the current turn's response start
 * looking from" — every block extractor narrows its search to lines
 * BELOW this index.
 */
export function findLastUserEchoIdx(lines: readonly string[]): number {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? '';
    if (!matches('userEcho', line)) continue;
    if (matches('userEchoPlaceholder', line)) continue;
    return i;
  }
  return -1;
}

/**
 * The anchor we hand to extractors is `lastUserEcho + 1` (exclusive
 * lower bound). When there's no user echo, anchor at 0 so initial-state
 * markers (trust prompt, oauth URL) can still match.
 */
export function computeAnchor(lines: readonly string[]): number {
  const idx = findLastUserEchoIdx(lines);
  return Math.max(0, idx + 1);
}
