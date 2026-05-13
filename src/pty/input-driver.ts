/** Minimal writer surface the driver depends on. */
export interface PtyWriter {
  write(data: string): void;
}

/** Configurable keystroke set. Externalized so future TUI revisions can
 *  override individual keys without forking the driver. */
export interface InputKeys {
  /** Submit a message. */
  readonly submit: string;
  /** Soft newline within an in-progress message (multi-line input). */
  readonly newline: string;
  /** Cancel / interrupt the current turn. */
  readonly interrupt: string;
  /** Clear the current input line. */
  readonly clearLine: string;
  /** Prefix sent before a steer message. */
  readonly steerPrefix: string;
}

export const DEFAULT_KEYS: InputKeys = Object.freeze({
  submit: '\r',
  newline: '\n',
  interrupt: '\x03',
  clearLine: '\x15',
  steerPrefix: '\x1b',
});

/**
 * High-level keystroke driver for the wrapped TUI. Each operation writes a
 * specific sequence to the PTY; nothing reads back. Pair with the parser to
 * confirm side effects.
 */
export class InputDriver {
  constructor(
    private readonly writer: PtyWriter,
    private readonly keys: InputKeys = DEFAULT_KEYS,
  ) {}

  /**
   * Type a message and submit it. Embedded `\n` characters become soft
   * newlines (so multi-line input renders as multiple lines in the TUI
   * before submission), and only the final `submit` keystroke commits.
   */
  send(text: string): void {
    this.typeMessage(text);
    this.writer.write(this.keys.submit);
  }

  /**
   * Type a message but do NOT submit it. Useful for staged input where the
   * caller wants to attach a file or insert further chunks before
   * committing.
   */
  typeMessage(text: string): void {
    const parts = text.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) this.writer.write(this.keys.newline);
      if (part.length > 0) this.writer.write(part);
    });
  }

  /**
   * Send a Ctrl-C interrupt. Used to abort an in-flight turn; the queued
   * message slot is unaffected (see the message_queue Alloy spec).
   */
  interrupt(): void {
    this.writer.write(this.keys.interrupt);
  }

  /**
   * Steer the in-flight turn by sending an ESC then a new instruction.
   * Behavior depends on the TUI's steer affordance — the prefix is
   * configurable so consumers can disable steering by setting it to ''.
   */
  steer(text: string): void {
    if (this.keys.steerPrefix.length > 0) this.writer.write(this.keys.steerPrefix);
    this.typeMessage(text);
    this.writer.write(this.keys.submit);
  }

  /** Clear the current input line without submitting. */
  clearLine(): void {
    this.writer.write(this.keys.clearLine);
  }

  /** Send a raw keystroke sequence. Escape hatch for advanced consumers. */
  raw(data: string): void {
    this.writer.write(data);
  }
}
