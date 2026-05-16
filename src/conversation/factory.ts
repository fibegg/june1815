import { join } from 'node:path';
import { Conversation } from './conversation.js';
import { ClaudePty, NodePtySpawner, type PtySpawner } from '../pty/claude-pty.js';
import { InputDriver } from '../pty/input-driver.js';
import { TerminalAdapter } from '../pty/terminal.js';
import { TuiParser } from '../pty/tui-parser.js';
import type { ConversationFactory } from './manager.js';

/**
 * Low-level helper that turns a fully-formed `claude` argv into a
 * `Conversation` wrapping the PTY+terminal+parser+driver stack. Exposed
 * so that consumers OTHER than the HTTP factory (e.g. the stream-json
 * shim) can build a Conversation with their own arg list, without
 * re-implementing the wiring.
 *
 * The caller owns the argv: this function will not inject defaults like
 * `--permission-mode` or `--add-dir`. That's the factory's job (for the
 * HTTP path) or the shim runner's job (for stream-json mode).
 */
export interface AssembleConversationDeps {
  readonly id: string;
  readonly claudePath: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cols: number;
  readonly rows: number;
  readonly idleQuietMs: number;
  readonly spawner?: PtySpawner;
}

export function assembleConversation(deps: AssembleConversationDeps): Conversation {
  const pty = ClaudePty.start(
    {
      command: deps.claudePath,
      args: [...deps.args],
      cwd: deps.cwd,
      env: deps.env,
      cols: deps.cols,
      rows: deps.rows,
    },
    deps.spawner ?? new NodePtySpawner(),
  );
  const terminal = new TerminalAdapter({ cols: deps.cols, rows: deps.rows });
  const parser = new TuiParser();
  const driver = new InputDriver({ write: (d) => { pty.write(d); } });
  return new Conversation({
    id: deps.id,
    cwd: deps.cwd,
    pty,
    terminal,
    parser,
    driver,
    idleQuietMs: deps.idleQuietMs,
  });
}

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
  /** Root directory under which per-conversation upload folders live. The
   *  factory passes `<uploadsRoot>/<conversationId>` to claude as an
   *  additional `--add-dir` so claude can read attachments. */
  readonly uploadsRoot?: string;
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
    if (this.deps.uploadsRoot) {
      const uploadsDir = join(this.deps.uploadsRoot, opts.id);
      args.push('--add-dir', uploadsDir);
    }
    // The user explicitly named the cwd when they created the conversation
    // — that's their consent for claude to read/write/run inside it.
    // Without bypassPermissions, claude prompts on every Read / Bash /
    // Edit, which hangs a wrapped TUI session on dialogs the operator
    // can't see. The PTY parser still emits `permission_prompt` events
    // for any prompt that does slip through; this just unblocks the
    // common file-read path needed for image attachments.
    args.push('--permission-mode', 'bypassPermissions');

    const conv = assembleConversation({
      id: opts.id,
      claudePath: this.deps.claudePath,
      args,
      cwd: opts.cwd,
      env: this.deps.env,
      cols: this.deps.cols,
      rows: this.deps.rows,
      idleQuietMs: this.deps.idleQuietMs,
      ...(this.deps.spawner ? { spawner: this.deps.spawner } : {}),
    });
    return Promise.resolve(conv);
  }
}
