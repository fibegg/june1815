import { describe, expect, it } from 'vitest';
import { MessageQueue, type QueuedMessage } from '../../../src/conversation/queue.js';

function msg(id: string, text = 'x'): QueuedMessage {
  return { id, text, enqueuedAt: 0 };
}

describe('MessageQueue', () => {
  it('starts empty', () => {
    const q = new MessageQueue();
    expect(q.size).toBe(0);
    expect(q.inFlight).toBeNull();
    expect(q.pendingList).toEqual([]);
  });

  it('enqueue appends to the tail', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    expect(q.pendingList.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('dequeue moves head to in-flight (FIFO)', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    const popped = q.dequeue();
    expect(popped?.id).toBe('1');
    expect(q.inFlight?.id).toBe('1');
    expect(q.pendingList.map((p) => p.id)).toEqual(['2']);
  });

  it('refuses dequeue while in-flight is set', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    q.dequeue();
    expect(() => q.dequeue()).toThrow(/in-flight/);
  });

  it('complete clears in-flight without touching queue', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    q.dequeue();
    q.complete();
    expect(q.inFlight).toBeNull();
    expect(q.pendingList.map((p) => p.id)).toEqual(['2']);
  });

  it('steer replaces in-flight payload only', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    q.dequeue();
    q.steer(msg('S', 'redirected'));
    expect(q.inFlight?.id).toBe('S');
    expect(q.pendingList.map((p) => p.id)).toEqual(['2']);
  });

  it('steer with no in-flight throws', () => {
    const q = new MessageQueue();
    expect(() => q.steer(msg('s'))).toThrow();
  });

  it('interrupt clears in-flight, queue intact', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    q.dequeue();
    q.interrupt();
    expect(q.inFlight).toBeNull();
    expect(q.pendingList.map((p) => p.id)).toEqual(['2']);
  });

  it('rejects duplicate message ids', () => {
    const q = new MessageQueue();
    q.enqueue(msg('x'));
    expect(() => q.enqueue(msg('x'))).toThrow(/duplicate/);
  });

  it('size counts both pending and in-flight', () => {
    const q = new MessageQueue();
    q.enqueue(msg('1'));
    q.enqueue(msg('2'));
    expect(q.size).toBe(2);
    q.dequeue();
    expect(q.size).toBe(2);
    q.complete();
    expect(q.size).toBe(1);
  });
});
