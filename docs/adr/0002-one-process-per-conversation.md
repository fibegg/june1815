# ADR-0002: One `claude` child process per conversation

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

The HTTP server can serve many simultaneous conversations. Three viable models:

1. **One `claude` process per conversation** — long-lived, owned by the conversation.
2. **One global `claude` process** — switch context per turn via `--session-id` / `--resume`.
3. **Pool with LRU eviction** — bounded pool, evicted conversations resume on next touch.

Each `claude` child has non-trivial startup cost (MCP server boot, system prompt warm-up, hook registration). Each child also pins memory (~150–400 MB depending on MCP load) and one PTY slot.

## Decision

june1815 runs **one long-lived `claude` child process per `conversation_id`**, each in its own cwd. The `ConversationManager` owns a `Map<conversationId, Conversation>`. A hard cap (`JUNE1815_MAX_CONVERSATIONS`, default 8) bounds the fleet. When the cap is hit, new conversation requests fail fast with a structured error rather than evicting a live conversation.

## Consequences

**Easier**
- Per-conversation state (PTY size, cwd, session marker, message queue, in-flight turn) lives in one object with one owner.
- Parallel turns across conversations come for free — no global serialization.
- Steering and interrupt apply to a single, identified process without router gymnastics.
- Tests can mock a single `Conversation` without needing to model conversation switching.

**Harder**
- RAM scales linearly with active conversations. The cap is the user-visible mitigation; ADR future work could add a "park" state that releases the PTY but keeps the session marker for fast resume.
- Each conversation gets its own MCP servers / hooks; a misbehaving MCP affects only one conversation, but multiplies cost.

## Alternatives considered

- **Single global process with `--resume`** — Cheaper but serializes all turns globally; a slow turn on conversation A blocks B. Also incurs a full session-context-switch on every turn, which the TUI does not optimize for.
- **LRU pool** — Adds complexity (eviction policy, cold-resume latency budget) for a benefit that is only relevant at conversation counts far beyond a single user's normal load. Revisit if telemetry shows the cap being hit routinely in real deployments.
