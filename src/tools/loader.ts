import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_TOOL_DEFS } from './built-in-tool-defs.js';
import { ToolDefsSchema, type ToolDef, type ToolDefs } from './tool-defs.js';

export interface LoadToolDefsOptions {
  /** `--tool-defs <path>` occurrences from the CLI. */
  readonly cliPaths?: readonly string[];
  /**
   * Pre-split entries from the `JUNE1815_TOOL_DEFS` env var. Splitting is
   * the caller's responsibility (POSIX `:` vs Windows `;`).
   */
  readonly envPaths?: readonly string[];
  /**
   * Optional config directory. If a `tool-defs.json` sits inside, it is
   * picked up after env paths.
   */
  readonly configDir?: string;
  /**
   * Sink for validation warnings. Bad files don't abort startup — they
   * print to stderr and are skipped so the shim still runs with built-ins.
   */
  readonly io?: { warn: (msg: string) => void };
}

/**
 * Resolve the discovery order into a list of `ToolDefs` documents. The
 * built-ins are always element 0, so the resulting list passed to
 * `ToolInputSynthesizer.fromDefs` merges in the documented later-wins
 * order without any extra ceremony at the call site.
 */
export function loadToolDefs(opts: LoadToolDefsOptions = {}): readonly ToolDefs[] {
  const warn = opts.io?.warn ?? ((s: string) => process.stderr.write(`${s}\n`));
  const docs: ToolDefs[] = [BUILT_IN_TOOL_DEFS];

  const candidatePaths: string[] = [];
  if (opts.envPaths) for (const p of opts.envPaths) if (p.length > 0) candidatePaths.push(p);
  if (opts.configDir) candidatePaths.push(join(opts.configDir, 'tool-defs.json'));
  if (opts.cliPaths) for (const p of opts.cliPaths) if (p.length > 0) candidatePaths.push(p);

  for (const path of candidatePaths) {
    const doc = loadOne(path, warn);
    if (doc) docs.push(doc);
  }
  return docs;
}

function loadOne(path: string, warn: (msg: string) => void): ToolDefs | null {
  if (!existsSync(path)) {
    return null;
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    warn(`tool-defs: cannot read ${path}: ${(err as Error).message}`);
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn(`tool-defs: ${path} is not valid JSON: ${(err as Error).message}`);
    return null;
  }

  const result = ToolDefsSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? first.path.join('.') : '(root)';
    const msg = first ? first.message : 'schema mismatch';
    warn(`tool-defs: ${path} validation failed at ${where}: ${msg}`);
    return null;
  }

  // Verify every regex compiles, and that template references match the
  // available capture groups. Easier to surface here than at synthesis
  // time when a hot path would log spam.
  const narrowed: Record<string, ToolDef> = {};
  for (const [name, def] of Object.entries(result.data.tools)) {
    const entry: ToolDef = def.summaryRegex !== undefined
      ? { summaryRegex: def.summaryRegex, input: def.input }
      : { input: def.input };
    if (def.summaryRegex !== undefined) {
      try {
        const re = new RegExp(def.summaryRegex, 'u');
        if (!validateGroupReferences(def.input, re.source, name, warn, path)) {
          return null;
        }
      } catch (err) {
        warn(`tool-defs: ${path} tool '${name}' has invalid summaryRegex: ${(err as Error).message}`);
        return null;
      }
    }
    narrowed[name] = entry;
  }

  return { version: 1, tools: narrowed };
}

/**
 * Scan every string in `input` for `{N}` and `{name}` tokens and make
 * sure each one is satisfiable by the regex. We're lenient: `{summary}`
 * is always OK, unknown tokens are left as literals at synthesis time,
 * but a numbered reference past the regex's group count is a real bug
 * and should fail to load.
 */
function validateGroupReferences(
  input: unknown,
  regexSource: string,
  toolName: string,
  warn: (msg: string) => void,
  path: string,
): boolean {
  const numberedGroupCount = countCapturingGroups(regexSource);
  const namedGroups = extractNamedGroups(regexSource);
  const stack: unknown[] = [input];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === 'string') {
      const tokens = [...value.matchAll(/\{([^{}]+)\}/gu)].map((m) => (m[1] ?? '').trim());
      for (const tok of tokens) {
        if (tok === 'summary' || tok.length === 0) continue;
        if (/^\d+$/u.test(tok)) {
          const idx = Number.parseInt(tok, 10);
          if (idx < 1 || idx > numberedGroupCount) {
            warn(
              `tool-defs: ${path} tool '${toolName}' references capture group {${tok}} but summaryRegex only has ${numberedGroupCount}`,
            );
            return false;
          }
          continue;
        }
        if (!namedGroups.has(tok)) {
          warn(
            `tool-defs: ${path} tool '${toolName}' references named group {${tok}} which is not defined in summaryRegex`,
          );
          return false;
        }
      }
    } else if (Array.isArray(value)) {
      for (const v of value) stack.push(v);
    } else if (value !== null && typeof value === 'object') {
      for (const v of Object.values(value as Record<string, unknown>)) stack.push(v);
    }
  }
  return true;
}

/**
 * Count capturing groups in a regex source. Walks the string and counts
 * `(` that aren't `(?:`, `(?=`, `(?!`, `(?<=`, `(?<!`, escaped, or inside
 * a character class. Good enough for the lint check; we don't need 100%
 * regex-engine fidelity, just to catch the common "off by one" cases.
 */
function countCapturingGroups(source: string): number {
  let count = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === '\\') {
      i += 1;
      continue;
    }
    if (c === '[') {
      inClass = true;
      continue;
    }
    if (c === ']') {
      inClass = false;
      continue;
    }
    if (inClass) continue;
    if (c !== '(') continue;
    const next = source[i + 1];
    if (next !== '?') {
      count += 1;
      continue;
    }
    const third = source[i + 2];
    // `(?<name>` is a named capturing group; `(?<=` and `(?<!` are
    // look-behinds and don't capture.
    if (third === '<' && source[i + 3] !== '=' && source[i + 3] !== '!') count += 1;
  }
  return count;
}

function extractNamedGroups(source: string): Set<string> {
  const out = new Set<string>();
  const re = /\(\?<([A-Za-z_][A-Za-z0-9_]*)>/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.add(m[1] ?? '');
  }
  return out;
}

/** Exported for unit tests. */
export const __test = { countCapturingGroups, extractNamedGroups };
