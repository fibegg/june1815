import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type AttachmentKind = 'image' | 'file';

/** Inbound attachment payload from an API client. */
export interface AttachmentInput {
  readonly kind: AttachmentKind;
  /** `data:<mime>;base64,<bytes>` URL. */
  readonly dataUrl: string;
  /** Optional content-type override (defaults to the mime in the data URL). */
  readonly contentType?: string;
  /** Optional client-supplied filename — used to derive the on-disk name. */
  readonly name?: string;
}

/** Stored attachment record, suitable for inlining as `@<path>` in a
 *  message and (eventually) referencing in audit logs. */
export interface SavedAttachment {
  readonly kind: AttachmentKind;
  readonly path: string;
  readonly bytes: number;
  readonly contentType: string;
  readonly name: string;
}

export interface UploadStoreFs {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options: { recursive: boolean; mode?: number }): void;
  writeFileSync(path: string, data: Buffer): void;
}

const realFs: UploadStoreFs = {
  existsSync,
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  },
  writeFileSync: (p, d) => {
    writeFileSync(p, d);
  },
};

const DATA_URL_RE = /^data:([^;,]+)?(?:;base64)?,(.*)$/s;

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

function sanitizeFileName(name: string): string {
  // Strip directory separators, control chars, leading dots. Collapse runs
  // of unsafe chars to a single underscore. Cap length.
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\x00-\x1f/\\:*?"<>|]+/g, '_').replace(/^\.+/, '').trim();
  const limited = cleaned.slice(0, 96);
  return limited.length > 0 ? limited : 'unnamed';
}

function inferExt(contentType: string, kind: AttachmentKind, fallback: string): string {
  if (kind === 'image') {
    const lower = contentType.toLowerCase();
    return IMAGE_EXT[lower] ?? fallback;
  }
  return fallback;
}

/** Parse a `data:<mime>[;base64],<payload>` URL into its parts. */
export function parseDataUrl(
  dataUrl: string,
): { mime: string; bytes: Buffer } | null {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] ?? 'application/octet-stream').trim() || 'application/octet-stream';
  const payload = m[2] ?? '';
  const isBase64 = /;base64/i.test(dataUrl.slice(0, dataUrl.indexOf(',')));
  try {
    const bytes = isBase64 ? Buffer.from(payload, 'base64') : Buffer.from(decodeURIComponent(payload));
    return { mime, bytes };
  } catch {
    return null;
  }
}

/**
 * Writes user-supplied attachments to a per-message directory under
 * `<uploadsDir>/<messageId>/`. Returns SavedAttachment records the
 * conversation can splice into the outgoing message text as
 * `@<absolute-path>` references — the convention `claude` uses to attach
 * a local file to a turn.
 *
 * The store does NOT serve attachments back to clients; once written, a
 * file's lifetime is tied to its conversation directory and cleaned up
 * when the conversation is destroyed (caller's responsibility for v1).
 */
export class UploadStore {
  constructor(
    private readonly uploadsDir: string,
    private readonly fs: UploadStoreFs = realFs,
  ) {}

  get baseDir(): string {
    return this.uploadsDir;
  }

  save(messageId: string, attachment: AttachmentInput, index: number): SavedAttachment {
    const parsed = parseDataUrl(attachment.dataUrl);
    if (!parsed) {
      throw new Error('invalid data URL');
    }
    const contentType = attachment.contentType ?? parsed.mime;
    const dirForMessage = join(this.uploadsDir, sanitizeFileName(messageId));
    if (!this.fs.existsSync(dirForMessage)) {
      this.fs.mkdirSync(dirForMessage, { recursive: true, mode: 0o700 });
    }
    const fallbackExt = attachment.kind === 'image' ? 'png' : 'bin';
    const ext = inferExt(contentType, attachment.kind, fallbackExt);
    const fallbackName = `${attachment.kind === 'image' ? 'img' : 'file'}-${index + 1}.${ext}`;
    const name = attachment.name ? sanitizeFileName(attachment.name) : fallbackName;
    const fullPath = join(dirForMessage, name);
    this.fs.writeFileSync(fullPath, parsed.bytes);
    return {
      kind: attachment.kind,
      path: fullPath,
      bytes: parsed.bytes.length,
      contentType,
      name,
    };
  }
}

/** Produce the message text that a Conversation will actually send to
 *  claude: each attachment becomes a `@<absolute-path>` token, joined to
 *  the user text on a single line. Single-line composition is required
 *  because embedded `\n` characters flip claude's TUI input into
 *  multi-line mode, where `\r` inserts a newline instead of submitting.
 *
 *  The `@` prefix triggers claude's file-mention autocomplete — that's
 *  intentional, since it's how claude attaches files. The InputDriver
 *  pauses for a beat between writing the body and writing `\r` so the
 *  dropdown finishes resolving before our submit lands. */
export function composeMessageWithAttachments(
  text: string,
  attachments: readonly SavedAttachment[],
): string {
  if (attachments.length === 0) return text;
  const refs = attachments.map((a) => `@${a.path}`).join(' ');
  return text.length > 0 ? `${refs} ${text}` : refs;
}
