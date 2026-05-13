# HTTP client example

A TypeScript program that connects to a running `june15 gogogo`, creates
a conversation, sends a message, and prints text deltas as they arrive.

## Run

```sh
# from this directory
JUNE15_URL=http://127.0.0.1:7150 \
JUNE15_BEARER=<your-bearer> \
  npx tsx client.ts "say hi in three words"
```

If `JUNE15_URL` / `JUNE15_BEARER` are unset, the client reads from
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
