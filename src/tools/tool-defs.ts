import { z } from 'zod';

/**
 * One entry in a `tool-defs.json` file. Maps the TUI's `(name, summary)`
 * representation of a tool call to a structured `input` object that the
 * stream-json consumer can read like it came from claude directly.
 *
 * When `summaryRegex` is omitted, only `{summary}` is available for
 * interpolation inside `input` string values. When present, every named
 * and numbered capture group from the regex becomes available as
 * `{<name>}` / `{1}` / `{2}` / …
 */
export interface ToolDef {
  readonly summaryRegex?: string;
  readonly input: Readonly<Record<string, unknown>>;
}

/**
 * A `tool-defs.json` document. Files are loaded in discovery order and
 * merged with later-wins semantics per tool name (see
 * `src/tools/loader.ts`).
 */
export interface ToolDefs {
  readonly version: 1;
  readonly tools: Readonly<Record<string, ToolDef>>;
}

/**
 * Validation schema. Used at load time to surface bad files clearly.
 * The `input` field accepts any JSON value (string / number / boolean /
 * null / array / object) — string values are interpolated at synthesis
 * time, everything else is passed through verbatim.
 *
 * We don't annotate these with the public types directly because zod's
 * inferred `string | undefined` collides with `exactOptionalPropertyTypes`.
 * The loader narrows the parsed result into `ToolDefs` explicitly.
 */
export const ToolDefSchema = z.object({
  summaryRegex: z.string().min(1).optional(),
  input: z.record(z.string(), z.unknown()),
});

export const ToolDefsSchema = z.object({
  version: z.literal(1),
  tools: z.record(z.string().min(1), ToolDefSchema),
});
