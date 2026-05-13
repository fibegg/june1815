import * as clack from '@clack/prompts';
import type { ConfirmPrompt } from '../claude/installer.js';

/**
 * `@clack/prompts` wrapper that conforms to our `ConfirmPrompt` interface.
 * `clack.isCancel` is mapped to "no" so Ctrl-C during a confirm produces a
 * decline rather than a stack trace.
 */
export const clackConfirmPrompt: ConfirmPrompt = {
  async confirm(message: string): Promise<boolean> {
    const result = await clack.confirm({ message, initialValue: true });
    if (clack.isCancel(result)) return false;
    return result === true;
  },
};

export function intro(text: string): void {
  clack.intro(text);
}

export function outro(text: string): void {
  clack.outro(text);
}

export function note(text: string, title?: string): void {
  clack.note(text, title);
}
