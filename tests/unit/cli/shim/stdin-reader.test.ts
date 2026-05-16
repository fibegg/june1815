import { describe, expect, it } from 'vitest';
import { readUserInputs } from '../../../../src/cli/shim/stdin-reader.js';
import type {
  AttachmentInput,
  SavedAttachment,
  UploadStore,
} from '../../../../src/conversation/upload-store.js';

async function* fromChunks(...chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c;
}

function fakeUploadStore(): UploadStore {
  // Minimal mock satisfying the structural slice the reader uses.
  let counter = 0;
  return {
    baseDir: '/uploads',
    save: (_messageId: string, a: AttachmentInput, _i: number): SavedAttachment => {
      counter += 1;
      return {
        kind: a.kind,
        path: `/uploads/saved-${counter}.png`,
        bytes: 4,
        contentType: a.contentType ?? 'image/png',
        name: `img-${counter}.png`,
      };
    },
  } as unknown as UploadStore;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of iter) out.push(x);
  return out;
}

describe('readUserInputs', () => {
  it('parses a single user message with plain-text content array', async () => {
    const stdin = fromChunks(
      `${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
      })}\n`,
    );
    const results = await collect(readUserInputs(stdin));
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('hello');
    expect(results[0]?.attachments).toEqual([]);
  });

  it('accepts string-form content', async () => {
    const stdin = fromChunks(
      `${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: 'just a string' },
      })}\n`,
    );
    const results = await collect(readUserInputs(stdin));
    expect(results[0]?.text).toBe('just a string');
  });

  it('splits NDJSON across chunk boundaries', async () => {
    const msg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'split' }] },
    });
    const half = Math.floor(msg.length / 2);
    const stdin = fromChunks(msg.slice(0, half), `${msg.slice(half)}\n`);
    const results = await collect(readUserInputs(stdin));
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('split');
  });

  it('handles trailing line without newline', async () => {
    const msg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'no nl' }] },
    });
    const results = await collect(readUserInputs(fromChunks(msg)));
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('no nl');
  });

  it('skips malformed JSON lines but continues', async () => {
    const warnings: string[] = [];
    const warn = (m: string) => { warnings.push(m); };
    const good = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'ok' },
    });
    const stdin = fromChunks(`not-json\n${good}\n`);
    const results = await collect(readUserInputs(stdin, { warn }));
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('ok');
    expect(warnings.join('\n')).toMatch(/not valid JSON/);
  });

  it('drops non-user message types silently', async () => {
    const stdin = fromChunks(
      `${JSON.stringify({ type: 'control_response', request_id: 'x' })}\n`,
      `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'real' } })}\n`,
    );
    const results = await collect(readUserInputs(stdin));
    expect(results).toHaveLength(1);
    expect(results[0]?.text).toBe('real');
  });

  it('decodes base64 image blocks via the upload store and composes the message', async () => {
    const stdin = fromChunks(
      `${JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'what color?' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0K' },
            },
          ],
        },
      })}\n`,
    );
    const uploads = fakeUploadStore();
    const results = await collect(readUserInputs(stdin, { uploads }));
    expect(results).toHaveLength(1);
    expect(results[0]?.attachments).toHaveLength(1);
    expect(results[0]?.attachments[0]?.path).toBe('/uploads/saved-1.png');
    expect(results[0]?.text).toContain('@/uploads/saved-1.png');
    expect(results[0]?.text).toContain('what color?');
  });

  it('warns and drops image when no upload store is configured', async () => {
    const warnings: string[] = [];
    const warn = (m: string) => { warnings.push(m); };
    const stdin = fromChunks(
      `${JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'hi' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
            },
          ],
        },
      })}\n`,
    );
    const results = await collect(readUserInputs(stdin, { warn }));
    expect(results[0]?.attachments).toEqual([]);
    expect(results[0]?.text).toBe('hi');
    expect(warnings.join('\n')).toMatch(/no upload store/);
  });

  it('reports unsupported block types to warn', async () => {
    const warnings: string[] = [];
    const warn = (m: string) => { warnings.push(m); };
    const stdin = fromChunks(
      `${JSON.stringify({
        type: 'user',
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'main' },
            { type: 'tool_result', tool_use_id: 'x', content: 'y' },
          ],
        },
      })}\n`,
    );
    const results = await collect(readUserInputs(stdin, { warn }));
    expect(results[0]?.text).toBe('main');
    expect(warnings.join('\n')).toMatch(/dropped 1 unsupported/);
  });
});
