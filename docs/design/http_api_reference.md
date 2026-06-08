# HTTP API reference

Bearer auth (`Authorization: Bearer <token>`) on every `/v1/*` route.
`/healthz` is public.

## Health

```
GET /healthz
```

```json
{ "status": "ok", "version": "0.0.0", "startedAt": "...", "uptimeMs": 123 }
```

## Auth

```
GET /v1/auth/status
```

```json
{ "authenticated": true, "source": "env_oauth", "envKey": "CLAUDE_CODE_OAUTH_TOKEN" }
```

`source` is one of: `env_oauth`, `env_anthropic_key`, `env_claude_key`,
`june1815_token_file`, `claude_credentials`, `none`.

```
POST /v1/auth/token        { "token": "..." }   -> { "stored": true }
DELETE /v1/auth                                  -> 204
```

## Conversations

```
GET /v1/conversations
POST /v1/conversations     { "cwd": "/path", "id"?, "model"?, "effort"?, "systemPromptAppend"? }
GET /v1/conversations/:id
DELETE /v1/conversations/:id     -> 204
```

Each conversation object:

```json
{ "id": "<uuid>", "cwd": "/path", "state": "ready", "pendingCount": 0 }
```

States: `starting`, `ready`, `busy`, `killed`.

## Messages

```
POST /v1/conversations/:id/messages    { "text": "..." }
```

Returns `Content-Type: text/event-stream`. Events:

```
event: text_delta        data: {"type":"text_delta","text":"Hello"}
event: reasoning_delta   data: {"type":"reasoning_delta","text":"..."}
event: tool_use          data: {"type":"tool_use","name":"Bash","summary":"ls"}
event: usage             data: {"type":"usage","inputTokens":1000,"outputTokens":234}
event: done              data: {"type":"done","messageId":"...","sessionId":"..."}
event: error             data: {"type":"error","code":"...","message":"..."}
event: interrupted       data: {"type":"interrupted","at":"text"}
event: auth_required     data: {"type":"auth_required","url":"https://claude.ai/..."}
event: permission_prompt data: {"type":"permission_prompt","question":"Allow ..."}
```

Stream closes after `done` or `error`. Use SSE comment lines for keep-alive.

```
POST /v1/conversations/:id/interrupt           -> { "interrupted": true }
POST /v1/conversations/:id/queue { "text": "..." }  -> { "messageId": "...", "queued": true }
POST /v1/conversations/:id/steer { "text": "..." }  -> { "messageId": "...", "steered": true }
```

## Error envelope

Every error responds with:

```json
{ "code": "conversation_not_found", "message": "...", "details": { ... } }
```

Status codes:

| Code | HTTP |
| --- | --- |
| `config_invalid`, `config_yaml_parse`, `http_bad_request` | 400 |
| `auth_unavailable`, `http_unauthorized` | 401 |
| `conversation_not_found` | 404 |
| `conversation_busy` | 409 |
| `pty_dead` | 410 |
| `conversation_limit_reached` | 429 |
| `pty_spawn_failed`, `config_yaml_read` | 500 |
| `claude_not_found`, `claude_install_*` | 503 |
