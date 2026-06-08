# HTTP client example

A TypeScript program that connects to a running `june1815 gogogo`, creates
a conversation, sends a message, and prints text deltas as they arrive.

## Run

```sh
# from this directory
JUNE1815_URL=http://127.0.0.1:7150 \
JUNE1815_BEARER=<your-bearer> \
  npx tsx client.ts "say hi in three words"
```

If `JUNE1815_URL` / `JUNE1815_BEARER` are unset, the client reads from
`process.env` and falls back to defaults (`http://127.0.0.1:7150` and an
empty token). You can also write them in a `.env` file beside this
script and source it.

## What it shows

- Issuing a `POST /v1/conversations` to create a fresh session under
  `cwd: /tmp`.
- Issuing a streaming `POST /v1/conversations/:id/messages` and reading
  the SSE response without any client library — just `fetch` and an
  incremental decoder.
- Parsing each `event: <name>` + `data: <json>` pair into a typed
  object and dispatching by `type`.
- Stopping when `done` arrives.

See [`client.ts`](./client.ts).
