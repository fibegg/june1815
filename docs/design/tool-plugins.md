# Tool plugins — user-extensible tool input synthesis

When `june15` reports a tool call to a wire-protocol consumer (whether
via [shim mode](./shim-mode.md) or — in a future change — the HTTP
SSE stream), it needs to translate the TUI's `(name, summary)` view of
a tool call into the structured `input` object that consumers expect.

The TUI shows tool calls like `⏺ Read(/etc/hosts)`. Our parser
extracts:

- **name**: `"Read"`
- **summary**: `"/etc/hosts"`

The stream-JSON consumer expects:

```json
{"type":"tool_use","name":"Read","input":{"file_path":"/etc/hosts"}}
```

Going from one to the other requires a tool-specific mapping. Built-in
mappings cover the well-known claude tools out of the box; user files
add or override mappings for custom and MCP-registered tools.

## When you need this

You only need a custom plugin when:

- you're using an MCP tool whose name doesn't match a built-in, **and**
- you want the consumer to receive a structured `input` matching that
  tool's actual schema (not a generic `{summary: "<raw>"}` fallback).

If neither condition applies, ignore this doc — the defaults are fine.

## Discovery order

Tool def files are loaded in this order (later wins on conflict):

1. **Built-in defaults** baked into the package
2. **Env var** — `JUNE15_TOOL_DEFS=/path/a.json:/path/b.json` (`:` on
   POSIX, `;` on Windows)
3. **Config-relative** — `~/.config/june15/tool-defs.json` if it
   exists
4. **CLI flag** — `--tool-defs /path/c.json` (repeatable; only the
   shim sees this — passed in via the shim's argv)

A file that fails to load (bad JSON, unknown version, broken regex,
template reference past the regex's group count) is reported to stderr
and skipped; the rest of the discovery continues. The shim never aborts
startup over a malformed plugin.

## File format

```jsonc
{
  "$schema": "https://june15.dev/schemas/tool-defs.v1.json",
  "version": 1,
  "tools": {
    "Read": {
      "input": { "file_path": "{summary}" }
    },
    "Bash": {
      "input": { "command": "{summary}" }
    },
    "Edit": {
      "summaryRegex": "^([^,]+?)\\s*,\\s*(.+)$",
      "input": { "file_path": "{1}", "instruction": "{2}" }
    },
    "acme__find_user": {
      "summaryRegex": "^(?<user>\\S+)\\s+in\\s+(?<org>\\S+)$",
      "input": { "username": "{user}", "scope": "{org}" }
    },
    "MyCustomTool": {
      "input": { "raw": "{summary}", "version": "v2" }
    }
  }
}
```

### Semantics

- **`summaryRegex`** (optional): JavaScript regex applied to the
  summary string. Numbered groups (`(…)`) and named groups
  (`(?<name>…)`) become available as interpolation tokens. If the
  regex doesn't match, the entry falls back to `{summary: "<raw>"}`.
- **`input`** (required): an arbitrary JSON object. **String values**
  are scanned for `{token}` placeholders and substituted at synthesis
  time. **Non-string values** (numbers, booleans, null, nested objects,
  arrays) pass through verbatim — though strings inside nested objects
  and arrays are still interpolated.

### Interpolation tokens

| Token | Replaced with |
|---|---|
| `{summary}` | The raw summary string |
| `{1}` `{2}` … | Numbered capture groups from `summaryRegex` |
| `{<name>}` | Named capture from `(?<name>…)` in `summaryRegex` |

Unknown tokens are left as literal text. This means you can embed
`{x}` as a literal in your input if you need to — only `{summary}` /
`{N}` / `{name}` are recognised.

### Validation

Files are validated at load time:

- `version` must equal `1`.
- `tools` is an object; each key must be a non-empty string.
- Each tool entry must have an `input` object. `summaryRegex` (if
  present) must compile under the `u` flag.
- Every `{N}` reference must be ≤ the regex's numbered group count.
- Every `{<name>}` reference must match a named group in the regex.

Anything else triggers a stderr warning and the file is skipped.

## Built-in mappings

Ships with single-field mappings for the well-known claude tools:

| Tool | `input` shape |
|---|---|
| `Read` | `{file_path: "{summary}"}` |
| `Bash` | `{command: "{summary}"}` |
| `BashOutput` | `{bash_id: "{summary}"}` |
| `KillShell` | `{shell_id: "{summary}"}` |
| `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | `{file_path: "{summary}"}` |
| `Grep`, `Glob` | `{pattern: "{summary}"}` |
| `Task`, `Agent` | `{description: "{summary}"}` |
| `WebFetch` | `{url: "{summary}"}` |
| `WebSearch` | `{query: "{summary}"}` |
| `TodoWrite` | `{summary: "{summary}"}` |

Any tool name not listed falls back to `{summary: "<raw>"}` unless
overridden by a user file.

## Examples

**Single-field tool** with one obvious argument — most MCP tools fit
here:

```json
{
  "version": 1,
  "tools": {
    "fetch_user": { "input": { "user_id": "{summary}" } }
  }
}
```

**Multi-arg tool** with a summary that needs splitting:

```json
{
  "version": 1,
  "tools": {
    "transfer_funds": {
      "summaryRegex": "^(\\S+)\\s+\\$(\\d+(?:\\.\\d{2})?)\\s+to\\s+(\\S+)$",
      "input": { "from_account": "{1}", "amount_usd": "{2}", "to_account": "{3}" }
    }
  }
}
```

**Override a built-in** because a future claude release changed its
display (the built-in expects `file_path` but the new TUI now shows
`/path:LINE_NUM`):

```json
{
  "version": 1,
  "tools": {
    "Read": {
      "summaryRegex": "^([^:]+)(?::(\\d+))?$",
      "input": { "file_path": "{1}", "line": "{2}" }
    }
  }
}
```

## Where it shows up at runtime

- In **shim mode**, the synthesized `input` is emitted as the
  `content_block.input` field of every `tool_use` stream event.
- The HTTP/SSE path currently emits only the raw `summary` string in
  its `tool_use` events; surfacing the synthesized `input` there is
  tracked as a follow-up.

## Why this exists

The TUI is built for humans, and humans read `Read(/etc/hosts)` as
self-explanatory text. Wire-protocol consumers can't parse free-form
text, so something has to translate. Hard-coding that translation per
tool name in june15's source means every new MCP tool needs a june15
release. A small JSON config file makes the translation
user-extensible without forking.
