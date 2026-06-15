/**
 * Split a caller-supplied argv into three buckets, ready for the shim
 * to consume:
 *
 *   - `passthrough`: forwarded verbatim to the underlying claude when we
 *     spawn it via PTY.
 *   - `extracted`: fields the shim itself needs (the emitted `session_id`,
 *     the `model` echoed in `system/init`, custom `--tool-defs` paths,
 *     `--cwd` override, …). Several of these are ALSO appended to
 *     `passthrough` because claude needs them too.
 *   - `stripped`: flags specific to the stream-json IPC mode that don't
 *     apply when we drive claude via PTY (e.g. `-p`, `--output-format`).
 *
 * Unknown flags fall through to `passthrough` — any future claude flag
 * works without an arg-filter update.
 */

/**
 * Flag specs that take a single argument. Anything not listed and not
 * recognised by name is treated as a boolean flag (no value consumed).
 *
 * A few intentional choices:
 *   - `--tool-defs` is repeatable (`--tool-defs a.json --tool-defs b.json`)
 *     and the shim collects all of them.
 */
const VALUE_FLAGS = new Set([
  '--output-format',
  '--input-format',
  '--permission-prompt-tool',
  '--settings',
  '--model',
  '--effort',
  '--add-dir',
  '--allowedTools',
  '--allowed-tools',
  '--disallowedTools',
  '--disallowed-tools',
  '--setting-sources',
  '--permission-mode',
  '--plugin-dir',
  '--append-system-prompt',
  '--resume',
  '--session-id',
  '--mcp-config',
  '--mcp-debug',
  '--cwd',
  '--tool-defs',
]);

const STRIPPED_BOOLEAN = new Set([
  '-p',
  '--print',
  '--include-partial-messages',
  '--replay-user-messages',
]);

const STRIPPED_VALUE = new Set([
  '--output-format',
  '--input-format',
  '--permission-prompt-tool',
]);

/**
 * Result of splitting argv. Order is preserved within `passthrough`.
 * `extracted` is a structured view over the same flags (for fields the
 * shim needs to introspect) — those flags ALSO appear in `passthrough`
 * unless they are listed as stripped.
 */
export interface SplitArgs {
  readonly passthrough: readonly string[];
  readonly stripped: readonly string[];
  readonly extracted: {
    readonly model?: string;
    readonly effort?: string;
    readonly permissionMode?: string;
    readonly resume?: string;
    readonly sessionId?: string;
    readonly cwd?: string;
    readonly toolDefs: readonly string[];
    readonly addDirs: readonly string[];
  };
}

export function splitArgs(rawArgv: readonly string[]): SplitArgs {
  const passthrough: string[] = [];
  const stripped: string[] = [];
  let model: string | undefined;
  let effort: string | undefined;
  let permissionMode: string | undefined;
  let resume: string | undefined;
  let sessionId: string | undefined;
  let cwd: string | undefined;
  const toolDefs: string[] = [];
  const addDirs: string[] = [];

  let i = 0;
  while (i < rawArgv.length) {
    const token = rawArgv[i] ?? '';
    i += 1;

    // `--flag=value` form: split it and process the boolean / value
    // forms uniformly downstream.
    if (token.startsWith('--') && token.includes('=')) {
      const eq = token.indexOf('=');
      const flag = token.slice(0, eq);
      const value = token.slice(eq + 1);
      processFlag(flag, value);
      continue;
    }

    if (STRIPPED_BOOLEAN.has(token)) {
      stripped.push(token);
      continue;
    }

    if (VALUE_FLAGS.has(token)) {
      const value = rawArgv[i] ?? '';
      i += 1;
      processFlag(token, value);
      continue;
    }

    // Unknown token (or positional). Forward verbatim.
    passthrough.push(token);
  }

  function processFlag(flag: string, value: string): void {
    if (STRIPPED_VALUE.has(flag)) {
      stripped.push(flag, value);
      return;
    }
    switch (flag) {
      case '--model':
        model = value;
        passthrough.push(flag, value);
        return;
      case '--effort':
        effort = value;
        passthrough.push(flag, value);
        return;
      case '--permission-mode':
        permissionMode = value;
        passthrough.push(flag, value);
        return;
      case '--resume':
        resume = value;
        passthrough.push(flag, value);
        return;
      case '--session-id':
        sessionId = value;
        passthrough.push(flag, value);
        return;
      case '--cwd':
        cwd = value;
        // `--cwd` isn't a claude flag — it adjusts the spawn cwd, NOT a
        // claude argument. Consumed by the shim only.
        return;
      case '--tool-defs':
        toolDefs.push(value);
        // Consumed by the shim only; not a claude flag.
        return;
      case '--add-dir':
        addDirs.push(value);
        passthrough.push(flag, value);
        return;
      default:
        passthrough.push(flag, value);
    }
  }

  return {
    passthrough,
    stripped,
    extracted: {
      ...(model !== undefined ? { model } : {}),
      ...(effort !== undefined ? { effort } : {}),
      ...(permissionMode !== undefined ? { permissionMode } : {}),
      ...(resume !== undefined ? { resume } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(cwd !== undefined ? { cwd } : {}),
      toolDefs,
      addDirs,
    },
  };
}
