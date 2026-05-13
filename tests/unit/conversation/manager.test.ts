import { describe, expect, it, vi } from 'vitest';
import { ConversationManager, type ConversationFactory } from '../../../src/conversation/manager.js';
import type { Conversation } from '../../../src/conversation/conversation.js';
import { SessionMarkerStore, type SessionMarkerFs } from '../../../src/conversation/session-marker.js';
import { isJune15Error } from '../../../src/errors.js';

function fakeConv(id: string): Conversation {
  return {
    id,
    cwd: '/tmp',
    state: 'ready',
    pendingCount: 0,
    onEvent: () => () => {},
    waitForReady: () => Promise.resolve(),
    send: () => 'mid',
    interrupt: () => {},
    steer: () => 'mid',
    kill: vi.fn(),
    snapshotNow: () => Promise.resolve(),
  } as unknown as Conversation;
}

function fakeFactory(
  recorder?: (args: Parameters<ConversationFactory['create']>[0]) => void,
): ConversationFactory {
  return {
    create: (args) => {
      recorder?.(args);
      return Promise.resolve(fakeConv(args.id));
    },
  };
}

function inMemoryFs(): SessionMarkerFs {
  const files: Record<string, string> = {};
  return {
    existsSync: (p) => p in files,
    readFileSync: (p) => {
      const f = files[p];
      if (f === undefined) throw new Error(`ENOENT: ${p}`);
      return f;
    },
    writeFileSync: (p, d) => {
      files[p] = d;
    },
    mkdirSync: () => {},
    rmSync: (p) => {
      delete files[p];
    },
  };
}

describe('ConversationManager', () => {
  it('creates a conversation with a generated id when none provided', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 3,
    });
    const c = await mgr.create({ cwd: '/x' });
    expect(c.id.length).toBeGreaterThan(0);
    expect(mgr.size()).toBe(1);
  });

  it('honors a caller-supplied id', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 3,
    });
    const c = await mgr.create({ id: 'fixed', cwd: '/x' });
    expect(c.id).toBe('fixed');
  });

  it('refuses duplicate ids', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 3,
    });
    await mgr.create({ id: 'a', cwd: '/x' });
    try {
      await mgr.create({ id: 'a', cwd: '/x' });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune15Error(err)).toBe(true);
      if (isJune15Error(err)) expect(err.code).toBe('conversation_busy');
    }
  });

  it('enforces maxConversations', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 2,
    });
    await mgr.create({ cwd: '/x' });
    await mgr.create({ cwd: '/x' });
    try {
      await mgr.create({ cwd: '/x' });
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune15Error(err)).toBe(true);
      if (isJune15Error(err)) expect(err.code).toBe('conversation_limit_reached');
    }
  });

  it('passes a resumeSessionId from the marker store to the factory', async () => {
    const recorder = vi.fn();
    const markers = new SessionMarkerStore('/d', inMemoryFs());
    markers.write('rejoin', 'old-session');
    const mgr = new ConversationManager({
      factory: fakeFactory(recorder),
      markers,
      maxConversations: 3,
    });
    await mgr.create({ id: 'rejoin', cwd: '/x' });
    expect(recorder).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rejoin', resumeSessionId: 'old-session' }),
    );
  });

  it('delete removes from the map and kills the conversation', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 3,
    });
    const c = await mgr.create({ id: 'kill-me', cwd: '/x' });
    await mgr.delete('kill-me');
    expect(mgr.size()).toBe(0);
    expect(c.kill).toHaveBeenCalled();
  });

  it('delete on missing id throws conversation_not_found', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 3,
    });
    try {
      await mgr.delete('ghost');
      expect.fail('expected throw');
    } catch (err) {
      expect(isJune15Error(err)).toBe(true);
      if (isJune15Error(err)) expect(err.code).toBe('conversation_not_found');
    }
  });

  it('destroyAll deletes every conversation', async () => {
    const mgr = new ConversationManager({
      factory: fakeFactory(),
      markers: new SessionMarkerStore('/d', inMemoryFs()),
      maxConversations: 5,
    });
    await mgr.create({ id: 'a', cwd: '/x' });
    await mgr.create({ id: 'b', cwd: '/x' });
    await mgr.destroyAll();
    expect(mgr.size()).toBe(0);
  });
});
