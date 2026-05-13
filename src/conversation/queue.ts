/** A message awaiting delivery to a conversation's PTY. */
export interface QueuedMessage {
  readonly id: string;
  readonly text: string;
  readonly enqueuedAt: number;
}

/**
 * Per-conversation FIFO message queue with an `inFlight` slot. Mirrors the
 * `docs/alloy/message_queue.als` model: enqueue / dequeue / complete /
 * interrupt / steer. The implementation does not start turns — it only
 * tracks which message belongs to which slot.
 */
export class MessageQueue {
  private readonly pending: QueuedMessage[] = [];
  private _inFlight: QueuedMessage | null = null;

  enqueue(msg: QueuedMessage): void {
    if (this._inFlight?.id === msg.id) {
      throw new Error('message already in flight');
    }
    if (this.pending.some((p) => p.id === msg.id)) {
      throw new Error('duplicate message id');
    }
    this.pending.push(msg);
  }

  /** Move the head of the queue into the in-flight slot. Requires the slot
   *  to be empty. Returns the dequeued message, or null if the queue was
   *  empty. */
  dequeue(): QueuedMessage | null {
    if (this._inFlight) throw new Error('dequeue while in-flight is set');
    const head = this.pending.shift();
    if (!head) return null;
    this._inFlight = head;
    return head;
  }

  /** Mark the current turn as completed. Clears the in-flight slot. */
  complete(): void {
    this._inFlight = null;
  }

  /** Replace the in-flight message with a steered variant. The queue is
   *  unaffected (Alloy invariant `steerNeverConsumesQueue`). */
  steer(msg: QueuedMessage): void {
    if (!this._inFlight) throw new Error('steer with no message in flight');
    this._inFlight = msg;
  }

  /** Abort the in-flight turn. The queue tail is preserved; only the
   *  in-flight slot is cleared. */
  interrupt(): void {
    this._inFlight = null;
  }

  /** Read-only view of currently queued messages (head first). */
  get pendingList(): readonly QueuedMessage[] {
    return this.pending;
  }

  get inFlight(): QueuedMessage | null {
    return this._inFlight;
  }

  get size(): number {
    return this.pending.length + (this._inFlight ? 1 : 0);
  }
}
