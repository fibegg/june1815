# ADR-0003: REST + Server-Sent Events for the HTTP transport

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

Clients need both:

- **Request/response** semantics for control plane (create conversation, list, kill, set auth).
- **Push streaming** for turn events (`text_delta`, `reasoning_delta`, `tool_use`, `usage`, `interrupted`, `done`, `error`).

The transport must be implementable from any language with an HTTP client, debuggable with `curl`, and palatable to consumers that don't want a long-running socket.

## Decision

- The control plane is plain JSON REST under `/v1/*`.
- A turn is initiated by `POST /v1/conversations/:id/messages`, which **returns an SSE stream** (`Content-Type: text/event-stream`) until the server emits `event: done` or `event: error` and closes the connection.
- Out-of-band ambient events (auth challenges, tool confirmation prompts) flow over a separate, long-lived SSE at `GET /v1/conversations/:id/events`.
- Interrupt is a separate `POST /v1/conversations/:id/interrupt` request, not an in-stream message.

## Consequences

**Easier**
- `curl -N` works as a debugging client out of the box.
- One-shot consumers don't pay for a WebSocket runtime.
- The SSE event types map 1:1 onto callback-style streaming interfaces in consumer libraries — adapters are mechanical.
- Built-in HTTP framing means proxies, load balancers, and request logs all "just work".

**Harder**
- SSE is server-to-client only. Mid-turn user input (interrupt, steer) requires a parallel `POST`. We accept this — it's also clearer in logs than mixed-direction messages on one channel.
- Long-lived SSE connections need careful idle-timeout / keepalive handling. The server emits an `event: ping` every 25s on idle streams.

## Alternatives considered

- **WebSocket** — Bidirectional, but trades curl-friendliness and proxy compatibility for a feature (client→server mid-turn messaging) we can match with a sibling `POST` endpoint.
- **JSON-RPC over WebSocket** — The OpenCode / Codex "app-server" style. More opinionated and language-specific; we want the transport to feel like a normal REST API to consumers from any language.
- **gRPC** — Overkill for a local-process tool; adds protobuf tooling burden to every consumer.
