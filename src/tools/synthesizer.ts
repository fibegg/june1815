import type { ToolDef, ToolDefs } from './tool-defs.js';

/** Captured groups from a `summaryRegex` match, indexed and named. */
interface CaptureBindings {
  readonly summary: string;
  readonly numbered: readonly string[];
  readonly named: Readonly<Record<string, string>>;
}

/** Pre-compiled tool def: regex is parsed once at construction time. */
interface CompiledToolDef {
  readonly regex?: RegExp;
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * Translates `(toolName, summary)` from the TUI parser into a structured
 * `input` object matching whatever the wire-protocol consumer expects.
 *
 * Tool defs are merged at construction: later defs override earlier ones
 * for the same tool name, so a user file can shadow a built-in. Pass the
 * list in discovery order (built-ins first, then user files).
 */
export class ToolInputSynthesizer {
  private readonly tools: ReadonlyMap<string, CompiledToolDef>;

  private constructor(tools: ReadonlyMap<string, CompiledToolDef>) {
    this.tools = tools;
  }

  static fromDefs(defs: readonly ToolDefs[]): ToolInputSynthesizer {
    const merged = new Map<string, CompiledToolDef>();
    for (const doc of defs) {
      for (const [name, def] of Object.entries(doc.tools)) {
        merged.set(name, compile(def));
      }
    }
    return new ToolInputSynthesizer(merged);
  }

  /**
   * Build the structured `input` object for a `tool_use` content block.
   *
   * Fallback strategy (in order):
   *   1. Tool name found and `summaryRegex` (if any) matched → interpolate
   *      `input` template with captured bindings.
   *   2. Tool name found but `summaryRegex` set and didn't match → return
   *      `{ summary }` (lossy but predictable).
   *   3. Tool name unknown → return `{ summary }`.
   */
  synthesize(name: string, summary: string): Record<string, unknown> {
    const def = this.tools.get(name);
    if (!def) return { summary };

    let bindings: CaptureBindings = {
      summary,
      numbered: [],
      named: {},
    };

    if (def.regex) {
      const m = def.regex.exec(summary);
      if (!m) return { summary };
      bindings = {
        summary,
        // RegExpExecArray types capture-group slots as `string`, but at
        // runtime a non-participating optional group (`(?:foo)?`) returns
        // `undefined`. Coerce defensively.
        numbered: (m.slice(1) as unknown as (string | undefined)[]).map((g) => g ?? ''),
        named: { ...((m.groups ?? {}) as Record<string, string>) },
      };
    }

    return interpolateValue(def.input, bindings) as Record<string, unknown>;
  }
}

function compile(def: ToolDef): CompiledToolDef {
  if (def.summaryRegex === undefined) {
    return { input: def.input };
  }
  // The validation in `loader.ts` catches bad regex at load time. If we
  // somehow got here with a bad pattern, throw — synthesis is meant to be
  // deterministic and a bad def shouldn't poison the whole turn silently.
  return { regex: new RegExp(def.summaryRegex, 'u'), input: def.input };
}

/**
 * Recursively interpolate `{summary}` / `{N}` / `{name}` placeholders
 * inside any string value. Non-string values (numbers, booleans, null,
 * arrays, nested objects) are walked but otherwise passed through.
 */
function interpolateValue(value: unknown, b: CaptureBindings): unknown {
  if (typeof value === 'string') return interpolateString(value, b);
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, b));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateValue(v, b);
    }
    return out;
  }
  return value;
}

/**
 * Substitute `{token}` placeholders in `s`. Unknown tokens are left as
 * literal text — consumers occasionally want to embed `{x}` for some
 * other purpose, and silently dropping them would be surprising.
 *
 * Tokens are:
 *   - `{summary}` → raw summary string
 *   - `{N}`       → numbered capture group (1-based; group 0 = full match
 *                   is intentionally excluded — use `{summary}` for that)
 *   - `{name}`    → named capture group from `(?<name>…)`
 */
function interpolateString(s: string, b: CaptureBindings): string {
  return s.replace(/\{([^{}]+)\}/gu, (full, raw) => {
    const token = (raw as string).trim();
    if (token === 'summary') return b.summary;
    if (/^\d+$/u.test(token)) {
      const idx = Number.parseInt(token, 10);
      if (idx < 1) return full;
      const captured = b.numbered[idx - 1];
      return captured ?? '';
    }
    if (Object.prototype.hasOwnProperty.call(b.named, token)) {
      return b.named[token] ?? '';
    }
    return full;
  });
}

/** Exported for unit tests only. */
export const __test = { interpolateString, interpolateValue };
