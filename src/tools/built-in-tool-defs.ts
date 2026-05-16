import type { ToolDefs } from './tool-defs.js';

/**
 * Built-in mappings for well-known claude tools. These cover the most
 * common case (the tool's first/only argument shows up in the TUI
 * summary), so consumers of the stream-json output get a sensible
 * structured `input` field out of the box.
 *
 * Users who want richer parsing (e.g. multiple fields extracted from
 * a complex summary) ship their own `tool-defs.json` and the loader
 * merges it on top with later-wins semantics — see `loader.ts`.
 *
 * The mappings are intentionally minimal. They aren't trying to be a
 * full schema for every tool — just enough that the most-likely-relevant
 * field is populated. Anything more elaborate belongs in a user file.
 */
/**
 * Strip the common ` (N bytes)` / ` (N lines)` size annotation that
 * claude appends to tool-result summaries. The regex matches the path
 * (group 1) and discards the suffix so the synthesized `file_path` is
 * clean.
 */
const PATH_WITH_OPTIONAL_SIZE = '^(.+?)(?:\\s*\\((?:\\d+\\s*(?:bytes|lines)|new\\s+file)\\))?\\s*$';

export const BUILT_IN_TOOL_DEFS: ToolDefs = Object.freeze({
  version: 1,
  tools: Object.freeze({
    Read: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: '{1}' },
    },
    Bash: { input: { command: '{summary}' } },
    BashOutput: { input: { bash_id: '{summary}' } },
    KillShell: { input: { shell_id: '{summary}' } },
    Edit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: '{1}' },
    },
    Write: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: '{1}' },
    },
    MultiEdit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: '{1}' },
    },
    Grep: { input: { pattern: '{summary}' } },
    Glob: { input: { pattern: '{summary}' } },
    Task: { input: { description: '{summary}' } },
    Agent: { input: { description: '{summary}' } },
    WebFetch: { input: { url: '{summary}' } },
    WebSearch: { input: { query: '{summary}' } },
    TodoWrite: { input: { summary: '{summary}' } },
    NotebookEdit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { notebook_path: '{1}' },
    },
  }),
});
