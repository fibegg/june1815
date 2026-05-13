import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { registerConversationRoutes } from '../../../src/server/routes/conversations.js';
import {
  registerMessageRoutes,
  streamConversationUntilDone,
} from '../../../src/server/routes/messages.js';
import type { Conversation, ConversationEvent } from '../../../src/conversation/conversation.js';
import type { ConversationManager } from '../../../src/conversation/manager.js';
import type { UploadStore } from '../../../src/conversation/upload-store.js';
import { errorHandler } from '../../../src/server/middleware/error.js';
import type { AppEnv } from '../../../src/server/server.js';
import { June15Error } from '../../../src/errors.js';

function fakeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-1',
    cwd: '/tmp',
    state: 'ready',
    pendingCount: 0,
    onEvent: () => () => {},
    send: () => 'm-1',
    interrupt: () => {},
    steer: () => 'm-2',
    kill: () => {},
    waitForReady: () => Promise.resolve(),
    snapshotNow: () => Promise.resolve(),
    ...(overrides),
  } as unknown as Conversation;
}

function fakeManager(initial: Conversation[] = []): ConversationManager {
  const map = new Map<string, Conversation>(initial.map((c) => [c.id, c]));
  return {
    list: () => Array.from(map.values()),
    get: (id: string) => map.get(id),
    size: () => map.size,
    create: vi.fn(async (opts: { id?: string; cwd: string }) => {
      const id = opts.id ?? 'created';
      const c = fakeConversation({ id, cwd: opts.cwd });
      map.set(id, c);
      return c;
    }),
    delete: vi.fn(async (id: string) => {
      if (!map.has(id)) throw new June15Error('conversation_not_found', id);
      map.delete(id);
    }),
    destroyAll: async () => {
      map.clear();
    },
  } as unknown as ConversationManager;
}

function appWith(mgr: ConversationManager): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  registerConversationRoutes(app, { conversations: mgr });
  registerMessageRoutes(app, { conversations: mgr });
  app.onError(errorHandler());
  return app;
}

describe('GET /v1/conversations', () => {
  it('returns the list', async () => {
    const mgr = fakeManager([fakeConversation({ id: 'a' }), fakeConversation({ id: 'b' })]);
    const res = await appWith(mgr).fetch(new Request('http://t/v1/conversations'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { conversations: { id: string }[] };
    expect(body.conversations.map((c) => c.id).sort()).toEqual(['a', 'b']);
  });
});

describe('POST /v1/conversations', () => {
  it('creates and returns 201', async () => {
    const mgr = fakeManager();
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({ id: 'fresh', cwd: '/x' }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it('rejects an invalid body', async () => {
    const mgr = fakeManager();
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/conversations/:id', () => {
  it('returns 200 with summary', async () => {
    const mgr = fakeManager([fakeConversation({ id: 'a' })]);
    const res = await appWith(mgr).fetch(new Request('http://t/v1/conversations/a'));
    expect(res.status).toBe(200);
  });

  it('returns 404 for unknown id', async () => {
    const mgr = fakeManager();
    const res = await appWith(mgr).fetch(new Request('http://t/v1/conversations/ghost'));
    expect(res.status).toBe(404);
  });
});

describe('DELETE /v1/conversations/:id', () => {
  it('returns 204 on success', async () => {
    const mgr = fakeManager([fakeConversation({ id: 'kill' })]);
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations/kill', { method: 'DELETE' }),
    );
    expect(res.status).toBe(204);
  });
});

describe('POST /v1/conversations/:id/interrupt', () => {
  it('returns interrupted:true', async () => {
    const interrupted = vi.fn();
    const conv = fakeConversation({ id: 'a', interrupt: interrupted });
    const mgr = fakeManager([conv]);
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations/a/interrupt', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(200);
    expect(interrupted).toHaveBeenCalled();
  });
});

describe('POST /v1/conversations/:id/queue', () => {
  it('returns the messageId without streaming', async () => {
    const mgr = fakeManager([fakeConversation({ id: 'a' })]);
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations/a/queue', {
        method: 'POST',
        body: JSON.stringify({ text: 'hi' }),
      }),
    );
    const body = (await res.json()) as { messageId: string; queued: boolean };
    expect(body.queued).toBe(true);
    expect(body.messageId).toBeDefined();
  });
});

describe('attachments handling', () => {
  it('rejects attachments when no upload store factory is wired', async () => {
    const mgr = fakeManager([fakeConversation({ id: 'a' })]);
    const res = await appWith(mgr).fetch(
      new Request('http://t/v1/conversations/a/messages', {
        method: 'POST',
        body: JSON.stringify({
          text: 'see this',
          attachments: [{ kind: 'image', dataUrl: 'data:image/png;base64,QUJD' }],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('routes attachments through sendWithAttachments when the factory is wired', async () => {
    const sent: Array<{ text: string; attachments: readonly unknown[] }> = [];
    const conv = fakeConversation({
      id: 'a',
      sendWithAttachments: ((input: { text: string; attachments: readonly unknown[] }) => {
        sent.push(input);
        return 'm-att';
      }) as unknown as Conversation['sendWithAttachments'],
    });
    const mgr = fakeManager([conv]);
    const savedSentinel = {
      kind: 'image' as const,
      path: '/tmp/up/m/img-1.png',
      bytes: 3,
      contentType: 'image/png',
      name: 'img-1.png',
    };
    const fakeStore = {
      baseDir: '/tmp/up',
      save: () => savedSentinel,
    } as unknown as UploadStore;

    const app = new Hono<AppEnv>();
    registerConversationRoutes(app, { conversations: mgr });
    registerMessageRoutes(app, {
      conversations: mgr,
      uploadStoreFor: () => fakeStore,
    });
    app.onError(errorHandler());

    const res = await app.fetch(
      new Request('http://t/v1/conversations/a/queue', {
        method: 'POST',
        body: JSON.stringify({
          text: 'check this out',
          attachments: [{ kind: 'image', dataUrl: 'data:image/png;base64,QUJD' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.text).toBe('check this out');
    expect(sent[0]?.attachments).toEqual([savedSentinel]);
  });
});

describe('streamConversationUntilDone', () => {
  it('writes mapped SSE events and closes on message_completed', async () => {
    let onEventCb: (e: ConversationEvent) => void = () => {};
    const conv = fakeConversation({
      id: 'a',
      onEvent: (cb: (e: ConversationEvent) => void) => {
        onEventCb = cb;
        return () => undefined;
      },
    });
    const written: { event: string; data: string }[] = [];
    let closed = false;
    const stream = {
      writeSSE: (p: { event: string; data: string }) => {
        written.push(p);
        return Promise.resolve();
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    };
    const promise = streamConversationUntilDone(stream, conv, 'm-target');
    // emit a text_delta, then a message_completed for the target message
    onEventCb({ type: 'text_delta', text: 'hello' });
    onEventCb({ type: 'message_completed', messageId: 'm-target' });
    await promise;
    expect(closed).toBe(true);
    const eventNames = written.map((w) => w.event);
    expect(eventNames).toContain('text_delta');
    expect(eventNames).toContain('done');
  });

  it('ignores completions for other messages', async () => {
    let onEventCb: (e: ConversationEvent) => void = () => {};
    const conv = fakeConversation({
      onEvent: (cb: (e: ConversationEvent) => void) => {
        onEventCb = cb;
        return () => undefined;
      },
    });
    const written: { event: string }[] = [];
    let closed = false;
    const stream = {
      writeSSE: (p: { event: string; data: string }) => {
        written.push({ event: p.event });
        return Promise.resolve();
      },
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    };
    const promise = streamConversationUntilDone(stream, conv, 'm-target');
    onEventCb({ type: 'message_completed', messageId: 'm-other' });
    // ...should NOT close. Then send our own completion.
    onEventCb({ type: 'message_completed', messageId: 'm-target' });
    await promise;
    expect(closed).toBe(true);
    expect(written.filter((w) => w.event === 'done').length).toBe(1);
  });
});
