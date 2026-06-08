# Image attachments via base64 data URLs

## When to use

You need to attach images (and small files) to a chat-style API call
and you'd rather not parse `multipart/form-data`. Best fit: small to
medium attachments (≤ a few MB) sent inline with a JSON request body
where keeping the round-trip count low matters.

## Shape

API body:

```jsonc
POST /v1/conversations/:id/messages
{
  "text": "look at this",
  "attachments": [
    { "kind": "image", "dataUrl": "data:image/png;base64,iVBORw0K...", "name": "screen.png" }
  ]
}
```

Server pipeline:

1. zod validates the body. `dataUrl` is `string`, capped at a generous
   bound (20 MB raw chars in june1815) per entry; the array is capped at
   16 entries.
2. `UploadStore.save(messageId, attachment, index)` parses the data URL,
   sanitizes the filename (strip path separators, control chars, leading
   dots), and writes to
   `<uploadsRoot>/<conversationId>/<messageId>/<name>`.
3. Conversation prepends `@<absolute-path>` lines to the user text and
   sends the composed message to claude. claude reads the file by
   absolute path because the factory passed `<uploadsRoot>/<conversationId>`
   as an `--add-dir`.

## Browser-side helpers

`FileReader.readAsDataURL(blob)` produces the same data URL shape used
on the wire. The UI's MessageInput accepts attachments via three
channels — file picker, paste from clipboard, drag-and-drop — and all
three converge on `readAsDataURL`.

## Sanitization is load-bearing

A naive `path.join(uploadsDir, attachment.name)` is a directory-traversal
hole. june1815's `sanitizeFileName`:

- Strips `\x00-\x1f`, `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`.
- Strips leading dots so users can't write `.../../etc/passwd`.
- Caps total length at 96 chars.
- Falls back to `unnamed` if nothing survives.

## Where it shows up in june1815

- `src/conversation/upload-store.ts` — `UploadStore`, `parseDataUrl`,
  `composeMessageWithAttachments`.
- `src/conversation/factory.ts` — `uploadsRoot` becomes `--add-dir` for
  the spawned claude.
- `src/server/routes/messages.ts` — attachment schema + dispatch.
- `ui/src/components/MessageInput.tsx` — picker, paste, drag-drop.

## When to outgrow it

When attachments routinely exceed a few MB, base64 inflation and JSON
parsing become the bottleneck. Add a sibling streaming-upload endpoint
that returns an id; the message body references the id. Don't remove
the data-URL path — keep both for backwards compatibility.
