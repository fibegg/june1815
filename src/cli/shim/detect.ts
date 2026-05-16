/**
 * The shim is selected purely by flag-sniffing argv. The Claude Agent
 * SDK (and any other consumer of `claude`'s stream-json IPC mode) passes
 * a fixed combination of flags that uniquely identify "I want stream-json
 * NDJSON on stdin and stdout, not the interactive TUI."
 *
 * We check for any of:
 *   - `--output-format stream-json` (or `--output-format=stream-json`)
 *   - `--input-format stream-json`
 *   - `-p` / `--print` (the legacy "one-shot print" mode that also
 *     expects stream-json when paired with `--output-format`)
 *
 * The caller is responsible for the rest of the routing — once this
 * returns true, the shim runner takes over and never falls back to the
 * normal CLI parser.
 */
export function isShimInvocation(argv: readonly string[]): boolean {
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? '';
    if (token === '-p' || token === '--print') return true;
    if (token === '--output-format' || token === '--input-format') {
      const value = argv[i + 1] ?? '';
      if (value === 'stream-json') return true;
    }
    if (token.startsWith('--output-format=') || token.startsWith('--input-format=')) {
      const value = token.slice(token.indexOf('=') + 1);
      if (value === 'stream-json') return true;
    }
  }
  return false;
}
