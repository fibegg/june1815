# Architecture

```mermaid
flowchart LR
  CLI[CLI / IDE / Automation]
  CLI -- HTTP REST + SSE --> Server[Hono app]
  Server --> Auth[AuthService]
  Server --> Manager[ConversationManager]
  Manager --> Conv1[Conversation A]
  Manager --> Conv2[Conversation B]
  subgraph "per conversation"
    Conv1 --> PtyA[ClaudePty]
    Conv1 --> ParserA[TUI parser]
    PtyA --> Claude1[claude TUI child]
    ParserA --> Conv1
  end
  Conv2 --> PtyB[ClaudePty]
  PtyB --> Claude2[claude TUI child]
```

## Components

| Layer | Module | Responsibility |
| --- | --- | --- |
| Config | `src/config/` | zod schema + loader (CLI > ENV > YAML > defaults) |
| Claude | `src/claude/` | locate / install / version-probe / auth-detect the binary |
| PTY | `src/pty/` | spawn under node-pty, drive xterm-headless, parse TUI |
| Conversation | `src/conversation/` | one wrapper per conv: queue, lifecycle, session marker |
| Server | `src/server/` | Hono REST + SSE with bearer auth + request-id |
| CLI | `src/cli/` | commander entry, prompts, doctor, gogogo composition |

## Per-turn dataflow

```mermaid
sequenceDiagram
  participant Client
  participant Server
  participant Conv as Conversation
  participant Pty
  participant Term as TerminalAdapter
  participant Parser

  Client->>Server: POST /v1/conversations/:id/messages {text}
  Server->>Conv: send(text)
  Conv->>Conv: queue.enqueue + drain
  Conv->>Pty: write(text + Enter)
  Pty-->>Conv: onData(raw bytes)
  Conv->>Term: write(bytes)
  Conv->>Conv: schedule snapshot (idleQuietMs)
  Term-->>Conv: snapshot{lines, cursor}
  Conv->>Parser: parse(snapshot)
  Parser-->>Conv: TuiEvent[]
  Conv-->>Server: ConversationEvent
  Server-->>Client: SSE event
  Note over Conv: repeats until turn_complete
  Conv-->>Server: message_completed
  Server-->>Client: SSE done -> close
```

## State machines

See the corresponding Alloy specs for executable verification:

- [Session lifecycle](../alloy/session_lifecycle.md) — Spawned → Ready → Busy → Idle → Killed.
- [Message queue](../alloy/message_queue.md) — FIFO + in-flight slot + steering.
- [Auth and config priority](../alloy/auth_config_priority.md) — total, deterministic, monotone.
- [HTTP API contract](../alloy/http_api_contract.md) — Created → Streaming → Idle → Terminated.

## Non-goals (v1)

- Web UI / dashboard.
- Multi-user authentication beyond bearer-token.
- Distributed deployment of conversations across machines.
- gRPC / WebSocket transport.
- Windows PTY support.
