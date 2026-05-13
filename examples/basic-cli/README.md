# Basic CLI walkthrough

Step-by-step trace of the most common june15 session: boot the server,
create a conversation, send a message, watch SSE events stream back.

## Prerequisites

- Node 22+, `claude` on PATH and authenticated.
- `npm i -g june15` (or `npx june15 ...`).

## 1. Sanity check

```sh
june15 doctor
```

```
[ok]    claude          /usr/local/bin/claude (v1.4.2)
[ok]    auth source     env_oauth
[ok]    data dir        ~/.local/share/june15 (will be created on first use)
[ok]    pty cols/rows   200 x 50
[ok]    http bind       127.0.0.1:7150
```

If anything is `[error]`, fix it before going further.

## 2. Start the server

```sh
june15 gogogo
```

Interactive mode prints:

```
└  june15 ready
   URL    http://127.0.0.1:7150
   bearer ad3f29bc...e91c
```

Keep this terminal open. Note the bearer token — every `/v1/*` call
needs it.

## 3. Create a conversation

```sh
TOKEN=ad3f29bc...e91c
URL=http://127.0.0.1:7150

curl -s -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST -d '{"cwd": "/tmp"}' \
  $URL/v1/conversations
```

```json
{"id":"3f2c8c1d-...","cwd":"/tmp","state":"starting","pendingCount":0}
```

`state: starting` → claude is booting under PTY. Poll until `state: ready`
or send a message immediately (it'll queue until ready).

## 4. Send a message and watch the stream

```sh
ID=3f2c8c1d-...

curl -N -s -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST -d '{"text":"say hi in three words"}' \
  $URL/v1/conversations/$ID/messages
```

Expected stream:

```
event: text_delta
data: {"type":"text_delta","text":"Hello"}

event: text_delta
data: {"type":"text_delta","text":" there"}

event: text_delta
data: {"type":"text_delta","text":" friend"}

event: usage
data: {"type":"usage","inputTokens":1234,"outputTokens":3}

event: done
data: {"type":"done","messageId":"..."}
```

The connection closes after `done`.

## 5. Interrupt and steer

If the model is in the middle of a long response, abort it:

```sh
curl -s -H "Authorization: Bearer $TOKEN" -X POST $URL/v1/conversations/$ID/interrupt
```

Or redirect the in-flight turn without restarting:

```sh
curl -s -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -X POST -d '{"text":"actually keep it under 5 words"}' \
  $URL/v1/conversations/$ID/steer
```

## 6. Clean up

```sh
curl -s -H "Authorization: Bearer $TOKEN" -X DELETE $URL/v1/conversations/$ID
```

Or just press Ctrl-C in the `june15 gogogo` terminal — all conversations
get killed cleanly on shutdown.
