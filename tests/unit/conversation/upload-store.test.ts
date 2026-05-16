import { describe, expect, it } from 'vitest';
import {
  composeMessageWithAttachments,
  parseDataUrl,
  UploadStore,
  type UploadStoreFs,
} from '../../../src/conversation/upload-store.js';

function inMemoryFs(): UploadStoreFs & { files: Record<string, Buffer>; dirs: Set<string> } {
  const files: Record<string, Buffer> = {};
  const dirs = new Set<string>();
  return {
    files,
    dirs,
    existsSync: (p) => dirs.has(p) || p in files,
    mkdirSync: (p) => {
      dirs.add(p);
    },
    writeFileSync: (p, d) => {
      files[p] = d;
    },
  };
}

describe('parseDataUrl', () => {
  it('parses a base64 data url', () => {
    const original = Buffer.from('hello');
    const dataUrl = `data:text/plain;base64,${original.toString('base64')}`;
    const out = parseDataUrl(dataUrl);
    expect(out?.mime).toBe('text/plain');
    expect(out?.bytes.equals(original)).toBe(true);
  });

  it('handles image/png base64', () => {
    const data = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const out = parseDataUrl(`data:image/png;base64,${data.toString('base64')}`);
    expect(out?.mime).toBe('image/png');
    expect(out?.bytes.equals(data)).toBe(true);
  });

  it('defaults mime to application/octet-stream when missing', () => {
    const out = parseDataUrl('data:;base64,QUJD'); // "ABC"
    expect(out?.mime).toBe('application/octet-stream');
    expect(out?.bytes.toString()).toBe('ABC');
  });

  it('returns null for malformed input', () => {
    expect(parseDataUrl('not a data url')).toBeNull();
  });
});

describe('UploadStore.save', () => {
  it('writes the file under <uploadsDir>/<messageId>/', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const data = Buffer.from('PNGDATA');
    const r = store.save('msg-1', {
      kind: 'image',
      dataUrl: `data:image/png;base64,${data.toString('base64')}`,
    }, 0);
    expect(r.path).toBe('/data/uploads/msg-1/img-1.png');
    expect(r.bytes).toBe(data.length);
    expect(r.contentType).toBe('image/png');
    expect(fs.files['/data/uploads/msg-1/img-1.png']?.equals(data)).toBe(true);
  });

  it('uses the supplied name when present (sanitized)', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const r = store.save('msg-1', {
      kind: 'image',
      dataUrl: 'data:image/jpeg;base64,QUJD',
      name: 'my photo.jpg',
    }, 0);
    expect(r.path).toBe('/data/uploads/msg-1/my photo.jpg');
    expect(r.name).toBe('my photo.jpg');
  });

  it('strips path separators and control chars from the name', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const r = store.save('msg-1', {
      kind: 'image',
      dataUrl: 'data:image/png;base64,QUJD',
      name: '../etc/passwd',
    }, 0);
    expect(r.path).not.toContain('..');
    expect(r.path).not.toContain('etc/passwd');
    expect(r.name).toBe('_etc_passwd');
  });

  it('falls back to file extension when mime is unknown image', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const r = store.save('msg-1', {
      kind: 'image',
      dataUrl: 'data:image/heic;base64,QUJD',
    }, 0);
    // unknown image mime -> default fallback ext 'png'
    expect(r.path.endsWith('.png')).toBe(true);
  });

  it('numbers attachments by index when no name is supplied', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const r0 = store.save('msg', { kind: 'image', dataUrl: 'data:image/png;base64,QUJD' }, 0);
    const r1 = store.save('msg', { kind: 'image', dataUrl: 'data:image/png;base64,QUJD' }, 1);
    expect(r0.name).toBe('img-1.png');
    expect(r1.name).toBe('img-2.png');
  });

  it('files use prefix `file-` and ext `bin` by default', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    const r = store.save('msg', {
      kind: 'file',
      dataUrl: 'data:application/octet-stream;base64,QUJD',
    }, 0);
    expect(r.path.endsWith('file-1.bin')).toBe(true);
  });

  it('throws on invalid data url', () => {
    const fs = inMemoryFs();
    const store = new UploadStore('/data/uploads', fs);
    expect(() =>
      store.save('m', { kind: 'image', dataUrl: 'not a data url' }, 0),
    ).toThrow();
  });

  it('does not re-mkdir an existing directory', () => {
    const fs = inMemoryFs();
    fs.dirs.add('/data/uploads/msg');
    const store = new UploadStore('/data/uploads', fs);
    store.save('msg', { kind: 'image', dataUrl: 'data:image/png;base64,QUJD' }, 0);
    expect(fs.dirs.has('/data/uploads/msg')).toBe(true);
  });
});

describe('composeMessageWithAttachments', () => {
  it('returns the text unchanged when no attachments', () => {
    expect(composeMessageWithAttachments('hi', [])).toBe('hi');
  });

  it('joins @-mentions on a single line with the user text', () => {
    // Single-line composition required: embedded \n flips claude's input
    // into multi-line mode where \r no longer submits.
    const out = composeMessageWithAttachments('look at these', [
      { kind: 'image', path: '/a/img1.png', bytes: 1, contentType: 'image/png', name: 'img1.png' },
      { kind: 'image', path: '/a/img2.png', bytes: 1, contentType: 'image/png', name: 'img2.png' },
    ]);
    expect(out).toBe('@/a/img1.png @/a/img2.png look at these');
  });

  it('returns only the @-mentions when text is empty', () => {
    const out = composeMessageWithAttachments('', [
      { kind: 'file', path: '/a/x.bin', bytes: 1, contentType: 'application/octet-stream', name: 'x.bin' },
    ]);
    expect(out).toBe('@/a/x.bin');
  });
});
