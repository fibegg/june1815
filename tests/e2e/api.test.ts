import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPreflight } from './helpers/preflight.js';
import { readSse } from './helpers/sse-client.js';
import { spawnGogogo, type SpawnedServer } from './helpers/spawn-server.js';

const preflight = checkPreflight();

// 1x1 transparent PNG, base64-encoded. Smallest possible attachment to
// exercise the upload pipeline without leaning on real image content.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BASE64}`;

interface TestCtx {
  server: SpawnedServer;
  authHeaders: HeadersInit;
}

// Vitest's `describe.skipIf` runs the whole block conditionally without
// reporting a failure. We emit a console line so the skip is loud during
// `npm run test:e2e` and not silent.
const skip = !preflight.ok;
if (skip) {
  // eslint-disable-next-line no-console
  console.warn(`[e2e] skipping suite: ${(preflight as { ok: false; reason: string }).reason}`);
}

describe.skipIf(skip)('june15 e2e — full API coverage', () => {
  const ctx = {} as TestCtx;

  beforeAll(async () => {
    ctx.server = await spawnGogogo();
    ctx.authHeaders = {
      Authorization: `Bearer ${ctx.server.bearerToken}`,
      'Content-Type': 'application/json',
    };
  });

  afterAll(async () => {
    await ctx.server?.stop();
  });

  it('GET /healthz works without bearer (public)', async () => {
    const res = await fetch(`${ctx.server.url}/healthz`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('rejects bearer-less requests on /v1/*', async () => {
    const res = await fetch(`${ctx.server.url}/v1/auth/status`);
    expect(res.status).toBe(401);
  });

  it('GET /v1/auth/status reports an authenticated source', async () => {
    const res = await fetch(`${ctx.server.url}/v1/auth/status`, { headers: ctx.authHeaders });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { authenticated: boolean; source: string };
    expect(body.authenticated).toBe(true);
    expect(body.source).not.toBe('none');
  });

  it('drives a conversation through create/send/queue/steer/interrupt/delete', async () => {
    // --- create -----------------------------------------------------------
    const createRes = await fetch(`${ctx.server.url}/v1/conversations`, {
      method: 'POST',
      headers: ctx.authHeaders,
      body: JSON.stringify({ cwd: ctx.server.dataDir }),
    });
    expect(createRes.status).toBe(201);
    const conv = (await createRes.json()) as { id: string; state: string };
    expect(conv.id.length).toBeGreaterThan(0);
    expect(['starting', 'ready']).toContain(conv.state);
    const cid = conv.id;

    try {
      // --- queue a follow-up first (before the in-flight turn even starts)
      const queueRes = await fetch(`${ctx.server.url}/v1/conversations/${cid}/queue`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify({ text: 'one' }),
      });
      expect(queueRes.status).toBe(200);

      // --- streaming send --------------------------------------------------
      const sendRes = await fetch(`${ctx.server.url}/v1/conversations/${cid}/messages`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify({ text: 'reply with the word READY exactly' }),
      });
      expect(sendRes.status).toBe(200);
      expect(sendRes.headers.get('content-type')).toContain('text/event-stream');

      let sawText = false;
      let sawDone = false;
      let textBuffer = '';
      for await (const frame of readSse(sendRes)) {
        if (frame.event === 'text_delta') {
          sawText = true;
          const payload = frame.data as { text?: string };
          if (typeof payload.text === 'string') textBuffer += payload.text;
        }
        if (frame.event === 'done') {
          sawDone = true;
          break;
        }
        if (frame.event === 'error') {
          throw new Error(`stream produced error: ${JSON.stringify(frame.data)}`);
        }
      }
      expect(sawText).toBe(true);
      expect(sawDone).toBe(true);
      expect(textBuffer.length).toBeGreaterThan(0);

      // --- second message — steer it after a brief delay ------------------
      const second = await fetch(`${ctx.server.url}/v1/conversations/${cid}/messages`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify({ text: 'write a long paragraph about apples' }),
      });
      expect(second.status).toBe(200);
      // wait briefly for the model to start producing, then steer
      let started = false;
      const reader = readSse(second);
      const steerPromise = (async () => {
        await new Promise((r) => setTimeout(r, 500));
        await fetch(`${ctx.server.url}/v1/conversations/${cid}/steer`, {
          method: 'POST',
          headers: ctx.authHeaders,
          body: JSON.stringify({ text: 'never mind, just say BANANA' }),
        });
      })();
      let sawSteerOrDone = false;
      for await (const frame of reader) {
        if (frame.event === 'text_delta') started = true;
        if (frame.event === 'done' || frame.event === 'interrupted') {
          sawSteerOrDone = true;
          break;
        }
      }
      await steerPromise;
      expect(started || sawSteerOrDone).toBe(true);

      // --- interrupt a long turn -----------------------------------------
      const third = await fetch(`${ctx.server.url}/v1/conversations/${cid}/messages`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify({ text: 'count slowly to one hundred' }),
      });
      expect(third.status).toBe(200);
      const interruptPromise = (async () => {
        await new Promise((r) => setTimeout(r, 1_000));
        const res = await fetch(`${ctx.server.url}/v1/conversations/${cid}/interrupt`, {
          method: 'POST',
          headers: ctx.authHeaders,
          body: '{}',
        });
        expect(res.status).toBe(200);
      })();
      let stoppedCleanly = false;
      for await (const frame of readSse(third)) {
        if (frame.event === 'done' || frame.event === 'interrupted' || frame.event === 'error') {
          stoppedCleanly = true;
          break;
        }
      }
      await interruptPromise;
      expect(stoppedCleanly).toBe(true);
    } finally {
      // --- delete ---------------------------------------------------------
      const del = await fetch(`${ctx.server.url}/v1/conversations/${cid}`, {
        method: 'DELETE',
        headers: ctx.authHeaders,
      });
      expect(del.status).toBe(204);
    }
  });

  it('accepts a message with an image attachment', async () => {
    const create = await fetch(`${ctx.server.url}/v1/conversations`, {
      method: 'POST',
      headers: ctx.authHeaders,
      body: JSON.stringify({ cwd: ctx.server.dataDir }),
    });
    expect(create.status).toBe(201);
    const { id } = (await create.json()) as { id: string };
    try {
      const send = await fetch(`${ctx.server.url}/v1/conversations/${id}/queue`, {
        method: 'POST',
        headers: ctx.authHeaders,
        body: JSON.stringify({
          text: 'image attached',
          attachments: [{ kind: 'image', dataUrl: TINY_PNG_DATA_URL, name: 'tiny.png' }],
        }),
      });
      expect(send.status).toBe(200);
      const body = (await send.json()) as { messageId: string; queued: boolean };
      expect(body.queued).toBe(true);
      expect(body.messageId.length).toBeGreaterThan(0);
    } finally {
      await fetch(`${ctx.server.url}/v1/conversations/${id}`, {
        method: 'DELETE',
        headers: ctx.authHeaders,
      });
    }
  });
});
