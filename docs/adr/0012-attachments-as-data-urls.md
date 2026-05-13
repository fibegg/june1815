# ADR-0012: Attachments delivered as base64 data URLs

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

API clients need to attach images (and occasionally files) to a message.
The most common candidates for the wire format are:

- **`multipart/form-data`** — the classic file-upload encoding.
- **Base64 data URLs in a JSON body** — the data URL `data:image/png;base64,…`
  inside the same JSON request that carries the message text.
- **Two-step upload + reference** — `POST /uploads` returns an id;
  `POST /messages` references it.

## Decision

For v1, attachments travel as **base64 data URLs in the message JSON body**.
The schema:

```jsonc
POST /v1/conversations/:id/messages
{
  "text": "look at this",
  "attachments": [
    { "kind": "image", "dataUrl": "data:image/png;base64,iVBORw0K...", "name": "screen.png" }
  ]
}
```

`UploadStore` parses each data URL, sanitizes the supplied filename
(strips path separators, control chars, leading dots), and writes the
bytes to `<dataDir>/uploads/<conversationId>/<messageId>/<name>`. The
factory has already passed `<uploadsRoot>/<conversationId>` to claude as
an additional `--add-dir`, so the conversation's child can read the file
by absolute path. `Conversation.sendWithAttachments` then prepends
`@<absolute-path>` lines to the user text — the convention claude uses
to attach a local file to a turn.

## Consequences

**Easier**
- One round trip per message; no multipart parser; no upload-id state to
  track across requests.
- Clients (browser, curl, language SDKs) all encode data URLs trivially.
- The UI's drag/drop and paste handlers already produce data URLs via
  `FileReader.readAsDataURL`.
- The Anthropic API uses base64 for inline images, so this matches the
  prevailing style developers already know.

**Harder**
- Base64 inflates the body by ~33%. We cap each attachment at 20 MB of
  data URL (≈15 MB raw) and the array at 16 entries to bound the worst
  case.
- Everything is JSON; we can't stream-upload a large file. Streaming
  uploads would be a v2 improvement (probably via a sibling
  `multipart/form-data` route that returns an id, then references it
  from the message body — adding an option without removing the data-URL
  path).

## Alternatives considered

- **multipart/form-data** — Streams large files efficiently but the
  parser is a non-trivial dependency for one feature, and the message
  body has to splice text + attachment metadata into the same multipart
  envelope. Bad symmetry with the rest of the JSON-everywhere API.
- **Two-step upload + reference** — Cleanest for very large files but
  doubles the round trips for the common small-image case and requires
  garbage-collecting orphan uploads. v2 work, not v1.
