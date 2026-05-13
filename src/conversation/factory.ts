import { Conversation } from './conversation.js';
import { ClaudePty, NodePtySpawner, type PtySpawner } from '../pty/claude-pty.js';
import { InputDriver } from '../pty/input-driver.js';
import { TerminalAdapter } from '../pty/terminal.js';
import { TuiParser } from '../pty/tui-parser.js';
import type { ConversationFactory } from './manager.js';

export interface ProductionFactoryDeps {
  /** Absolute path to the resolved claude binary. */
  readonly claudePath: string;
  /** Environment to inherit into the spawned claude process. */
  readonly env: NodeJS.ProcessEnv;
  /** PTY width. */
  readonly cols: number;
  /** PTY height. */
  readonly rows: number;
  /** Idle quiet period for the parser snapshot timer. */
  readonly idleQuietMs: number;
  /** Pluggable PTY spawner (tests). Production uses node-pty. */
  readonly spawner?: PtySpawner;
}

/**
 * Production factory that wires every PTY-layer component for one
 * conversation: ClaudePty + TerminalAdapter + TuiParser + InputDriver, all
 * fed into a Conversation. Forwarded options become CLI flags to claude.
 */
export class ProductionConversationFactory implements ConversationFactory {
  constructor(private readonly deps: ProductionFactoryDeps) {}

  create(opts: {
    id: string;
    cwd: string;
    model?: string;
    effort?: string;
    systemPromptAppend?: string;
    resumeSessionId?: string;
  }): Promise<Conversation> {
    const args: string[] = [];
    if (opts.model) args.push('--model', opts.model);
    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.systemPromptAppend) args.push('--append-system-prompt', opts.systemPromptAppend);
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
    args.push('--add-dir', opts.cwd);

    const pty = ClaudePty.start(
      {
        command: this.deps.claudePath,
        args,
        cwd: opts.cwd,
        env: this.deps.env,
        cols: this.deps.cols,
        rows: this.deps.rows,
      },
      this.deps.spawner ?? new NodePtySpawner(),
    );

    const terminal = new TerminalAdapter({ cols: this.deps.cols, rows: this.deps.rows });
    const parser = new TuiParser();
    const driver = new InputDriver({ write: (d) => pty.write(d) });

    const conv = new Conversation({
      id: opts.id,
      cwd: opts.cwd,
      pty,
      terminal,
      parser,
      driver,
      idleQuietMs: this.deps.idleQuietMs,
    });
    return Promise.resolve(conv);
  }
}
