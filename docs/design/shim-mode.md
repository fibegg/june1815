# Shim mode — drop-in `claude` stream-JSON adapter

`june1815` is invokable as a drop-in replacement for the `claude` CLI
**when claude is being driven through its stream-JSON IPC protocol**.
Any tool that spawns `claude --output-format stream-json --verbose
--input-format stream-json …` (the protocol used by the official
`@anthropic-ai/claude-agent-sdk`, custom SDK wrappers, and a handful
of third-party automation tools) can spawn `june1815` instead and get
back the same wire shape — except the bytes are produced by a
PTY-driven `claude` TUI under the hood rather than `claude` talking
stream-JSON directly.

This is useful when you want:

- **Server-mode features in a single-shot caller**: image attachments,
  custom tool input plugins, our deterministic turn-completion logic.
- **One consistent transport** across HTTP/SSE consumers and SDK
  consumers — both go through the same parser stack.
- **A safety net** for SDK consumers when claude's stream-JSON IPC
  surface changes: the TUI is more stable across releases.

## How it activates

The shim is selected by **flag-sniffing the argv** in `bin.ts`. There
is no `june1815 shim` subcommand because the caller spawning `claude` is
not aware of subcommands — it just passes the IPC flags. We detect:

- `--output-format stream-json` (space or `=` form)
- `--input-format stream-json` (space or `=` form)
- `-p` / `--print`

If any of these is present in the first `argv`, `runShim()` is invoked
and the rest of the CLI (commander, `gogogo`, …) is bypassed entirely.

## Discovery

```
caller spawns: june1815 --output-format stream-json --verbose
                      --input-format stream-json --model … …
                      < stdin (NDJSON SDKUserMessage)
                      > stdout (NDJSON SDKMessage)
```

## Required configuration

| Env var | Required | Purpose |
|---|---|---|
| `JUNE1815_CLAUDE_PATH` | **yes** | Absolute path to the real `claude` binary. Must exist and be executable. If unset or missing, the shim emits a `system/init` followed by a `result/error` and exits 1. |
| `JUNE1815_DATA_DIR` | no | Where per-session uploads land. Defaults to `~/.local/share/june1815`. |
| `JUNE1815_TOOL_DEFS` | no | `:`-separated list (`;` on Windows) of additional `tool-defs.json` files to load — see [tool-plugins.md](./tool-plugins.md). |

## Argument handling

The shim splits the incoming argv into three buckets:

1. **Stripped** — never forwarded to the underlying `claude` because
   they describe the IPC mode that no longer applies once we drive
   `claude` via PTY:
   - `-p`, `--print`
   - `--output-format <v>`
   - `--input-format <v>`
   - `--include-partial-messages`
   - `--replay-user-messages`
   - `--verbose`
   - `--permission-prompt-tool <v>`
   - `--settings <v>`

2. **Extracted** — read by the shim itself AND forwarded:
   - `--model <v>` (echoed in `system/init`)
   - `--effort <v>`
   - `--permission-mode <v>` (caller wins; default `bypassPermissions`)
   - `--resume <id>` (used as emitted `session_id` if no `--session-id`)
   - `--session-id <id>` (used as emitted `session_id`)
   - `--cwd <v>` (shim-only: changes the spawn cwd, NOT forwarded as a
     claude flag because it doesn't exist there)
   - `--tool-defs <path>` (shim-only — see tool-plugins.md)
   - `--add-dir <v>` (tracked so we don't duplicate the cwd injection)

3. **Passthrough** — everything else, forwarded verbatim. Unknown
   flags fall through, so a future claude release adds new flags
   without an arg-filter update.

The shim also auto-injects `--add-dir <cwd>` and `--add-dir
<uploads-root>` when the caller didn't already list them.

## Wire protocol

Newline-delimited JSON on stdin and stdout. One JSON object per line.
**stdout is the wire channel only** — all logs go to stderr.

### Input (stdin) — `SDKUserMessage`

```json
{
  "type": "user",
  "session_id": "<uuid or empty>",
  "parent_tool_use_id": null,
  "message": {
    "role": "user",
    "content": [
      {"type": "text", "text": "explain this image"},
      {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": "iVBOR…"}}
    ]
  }
}
```

The shim accepts `content` as either a plain string or an array of
content blocks. Recognised block types:

- `text` — concatenated into the message text
- `image` (`source.type === "base64"`) — decoded, written under
  `<JUNE1815_DATA_DIR>/uploads/<session_id>/<message_id>/<name>`, and
  referenced as `@<absolute-path>` in the composed message text

Other block types are dropped with a stderr warning. Non-`user`
messages (e.g. `control_response`) are silently dropped for v1.

### Output (stdout) — `SDKMessage`

Emit order per turn:

1. **One-time** at startup:
   ```json
   {"type":"system","subtype":"init","cwd":"…","tools":[],"mcp_servers":[],"model":"…","permissionMode":"…","uuid":"…","session_id":"…"}
   ```
2. **Per text / thinking delta**:
   ```json
   {"type":"stream_event","parent_tool_use_id":null,"uuid":"…","session_id":"…","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"…"}}}
   ```
   Replace `text_delta` → `thinking_delta` for reasoning.

3. **Per tool call**:
   ```json
   {"type":"stream_event",…,"event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_…","name":"Read","input":{"file_path":"/etc/hosts"}}}}
   {"type":"stream_event",…,"event":{"type":"content_block_stop","index":1}}
   ```
   `input` is synthesized by the [tool plugin system](./tool-plugins.md).

4. **On turn complete** (success):
   ```json
   {"type":"assistant",…,"message":{"id":"msg_…","role":"assistant","content":[{"type":"text","text":"…"}],"stop_reason":"end_turn",…}}
   {"type":"result","subtype":"success","is_error":false,"result":"…","usage":{…},"session_id":"…",…}
   ```

5. **On turn complete with errors**:
   ```json
   {"type":"result","subtype":"error","is_error":true,"errors":["…"],"session_id":"…",…}
   ```

### Session continuity

The shim emits a stable `session_id` for the life of one invocation.
It's derived (in priority order) from `--session-id`, `--resume`, or
a random UUID. Both `--session-id` and `--resume` are also forwarded
to the underlying `claude` so claude's own session store handles the
actual conversation history. The shim doesn't try to map its emitted
`session_id` to claude's internal id — for callers that round-trip
the session id (the typical SDK pattern), that's transparent.

## Out of scope (v1)

- `control_request` / `control_response` bidirectional protocol
  (permission prompts, deferred tool use). Not needed when claude runs
  with `bypassPermissions`.
- Telemetry breakdowns: `total_cost_usd` is always `0` and
  `modelUsage` is always `{}`. Consumers that need these compute them
  themselves from `usage`.
- MCP-stdio bridging through the shim. The underlying claude inherits
  MCP config from its normal config files; the shim doesn't re-broker.

## Quick smoke test

```bash
export JUNE1815_CLAUDE_PATH=/opt/homebrew/bin/claude
echo '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"reply with exactly: HELLO"}]}}' \
  | june1815 --output-format stream-json --verbose --input-format stream-json --model claude-opus-4-7
```

Expected: NDJSON `system/init` → `stream_event` `text_delta` "HELLO"
→ `assistant` → `result/success`, exit 0.
