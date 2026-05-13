# Server-Sent Events streaming

## When to use

Server pushes a stream of typed events to one client, the client never
needs to push events back over the same channel, and you want `curl -N`
to work as a debugger.

If you need client→server messages mid-stream (e.g. a chat with mid-turn
edits *and* the server pushes), use WebSocket. If you need binary or
multiplexed streams, use gRPC. Otherwise SSE.

## Wire format

Each event is:

```
event: <type>
data: <single-line JSON payload>
<blank line>
```

Multi-line data uses repeated `data:` lines. Keep payloads single-line
JSON to avoid that complication.

Heartbeat: send `: keep-alive` (a comment line) every 25 seconds on
idle streams so intermediate proxies don't reap the connection.

## Response headers

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no    # disables nginx buffering
```

## Stream lifecycle

A stream initiated by a request should:

1. Emit zero or more "in-progress" events.
2. Emit exactly one **terminal** event (`done` or `error` in our schema).
3. Close the connection.

The terminal event is a non-negotiable part of the contract — clients
should treat connection close without a terminal event as an error and
retry. This invariant is encoded in
[`http_api_contract.als`](../../docs/alloy/http_api_contract.als).

## Bridging internal events to SSE

Your internal event types and your public SSE types should not be
identical — keep them separate so refactors don't break the wire
contract. june15 has `ConversationEvent` (internal) and `SseEvent`
(public); a `bridge()` function maps between them and filters
internal-only events.

## Where it shows up in june15

- `src/server/events.ts` — zod schemas for every SSE event (the *public*
  contract).
- `src/server/sse.ts` — `formatSseFrame`, `SSE_HEADERS`, `SSE_HEARTBEAT`.
- `src/server/routes/messages.ts` — `streamConversationUntilDone` is the
  pump that connects internal events to SSE frames, filters by
  `messageId`, and closes on terminal.
