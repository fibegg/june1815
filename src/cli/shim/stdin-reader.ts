import { randomUUID } from 'node:crypto';
import {
  composeMessageWithAttachments,
  type AttachmentInput,
  type SavedAttachment,
  type UploadStore,
} from '../../conversation/upload-store.js';
import type { ContentBlock, UserMessageIn } from './sdk-types.js';

/**
 * One decoded user message ready for the runner to inject into the
 * wrapped claude session. `text` is the composed string (user text plus
 * any `@<path>` references to saved attachments).
 */
export interface ParsedUserInput {
  readonly messageId: string;
  readonly text: string;
  readonly attachments: readonly SavedAttachment[];
  readonly rawIgnoredBlocks: readonly string[];
}

export interface StdinReaderDeps {
  /** Required when image content blocks may appear. */
  readonly uploads?: UploadStore;
  /** Warning sink (stderr) for malformed lines / dropped blocks. */
  readonly warn?: (msg: string) => void;
}

/**
 * Async iterable over `process.stdin` lines, yielding decoded
 * `ParsedUserInput`s. Lines that fail to parse or are not user-role
 * messages are reported via `warn` and skipped — the iterator does not
 * abort the shim on bad input.
 */
export async function* readUserInputs(
  stdin: AsyncIterable<string | Buffer>,
  deps: StdinReaderDeps = {},
): AsyncIterable<ParsedUserInput> {
  const warn = deps.warn ?? ((m: string) => process.stderr.write(`${m}\n`));
  let pending = '';
  for await (const chunk of stdin) {
    pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let nl = pending.indexOf('\n');
    while (nl !== -1) {
      const line = pending.slice(0, nl).replace(/\r$/u, '');
      pending = pending.slice(nl + 1);
      nl = pending.indexOf('\n');
      if (line.length === 0) continue;
      const decoded = decodeLine(line, deps, warn);
      if (decoded) yield decoded;
    }
  }
  // Trailing line without a final newline.
  if (pending.length > 0) {
    const decoded = decodeLine(pending.replace(/\r$/u, ''), deps, warn);
    if (decoded) yield decoded;
  }
}

function decodeLine(
  line: string,
  deps: StdinReaderDeps,
  warn: (msg: string) => void,
): ParsedUserInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    warn(`shim: stdin line is not valid JSON: ${(err as Error).message}`);
    return null;
  }

  if (!isObject(parsed)) {
    warn('shim: stdin line is not a JSON object');
    return null;
  }
  const obj = parsed;
  if (obj.type !== 'user') {
    // control_response, keep_alive, etc. — silently dropped for v1.
    return null;
  }

  const user = obj as unknown as UserMessageIn;
  // `user.message` is typed-non-null but the JSON we just parsed is untrusted.
  // Guard explicitly rather than via optional chaining on a non-nullable type.
  const message = (user as { message?: UserMessageIn['message'] }).message;
  if (!message) {
    warn('shim: stdin line is missing `message`');
    return null;
  }
  const content = message.content;
  const messageId = randomUUID();

  const textParts: string[] = [];
  const attachmentsInput: AttachmentInput[] = [];
  const rawIgnoredBlocks: string[] = [];

  if (typeof content === 'string') {
    textParts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!isObject(block)) {
        rawIgnoredBlocks.push('(non-object block)');
        continue;
      }
      const b = block as ContentBlock;
      if (b.type === 'text' && typeof (block as { text?: unknown }).text === 'string') {
        textParts.push((block as { text: string }).text);
        continue;
      }
      if (b.type === 'image') {
        const src = (block as { source?: unknown }).source;
        if (
          isObject(src)
          && (src).type === 'base64'
          && typeof (src).data === 'string'
          && typeof (src).media_type === 'string'
        ) {
          const s = src as { data: string; media_type: string };
          attachmentsInput.push({
            kind: 'image',
            dataUrl: `data:${s.media_type};base64,${s.data}`,
            contentType: s.media_type,
          });
          continue;
        }
      }
      rawIgnoredBlocks.push(b.type);
    }
  } else {
    warn('shim: user.message.content is neither string nor array');
    return null;
  }

  if (rawIgnoredBlocks.length > 0) {
    warn(`shim: dropped ${rawIgnoredBlocks.length} unsupported content block(s): ${rawIgnoredBlocks.join(', ')}`);
  }

  const saved: SavedAttachment[] = [];
  if (attachmentsInput.length > 0) {
    if (!deps.uploads) {
      warn('shim: image attachment present but no upload store configured; dropping');
    } else {
      for (let i = 0; i < attachmentsInput.length; i += 1) {
        try {
          const a = attachmentsInput[i];
          if (!a) continue;
          saved.push(deps.uploads.save(messageId, a, i));
        } catch (err) {
          warn(`shim: failed to save attachment[${i}]: ${(err as Error).message}`);
        }
      }
    }
  }

  const userText = textParts.join(' ').trim();
  const composed = composeMessageWithAttachments(userText, saved);

  return {
    messageId,
    text: composed,
    attachments: saved,
    rawIgnoredBlocks,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
