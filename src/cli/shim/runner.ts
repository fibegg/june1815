import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { assembleConversation } from '../../conversation/factory.js';
import {
  UploadStore,
  type UploadStore as UploadStoreType,
} from '../../conversation/upload-store.js';
import type { PtySpawner } from '../../pty/claude-pty.js';
import { loadToolDefs } from '../../tools/loader.js';
import { ToolInputSynthesizer } from '../../tools/synthesizer.js';
import { splitArgs } from './arg-filter.js';
import { EventToStream, type NdjsonSink } from './event-to-stream.js';
import { readUserInputs, type ParsedUserInput } from './stdin-reader.js';

/** Sinks the runner writes to. Default in production: stdout / stderr. */
export interface ShimIo {
  stdout: NdjsonSink;
  stderr(msg: string): void;
}

export interface RunShimOptions {
  /** argv slice — already excluding `node` and the script path. */
  readonly argv: readonly string[];
  /** Process env at invocation time. */
  readonly env: NodeJS.ProcessEnv;
  /** Output sinks (defaults to process.{stdout,stderr}). */
  readonly io?: ShimIo;
  /** Override for `process.stdin` in tests. */
  readonly stdin?: AsyncIterable<string | Buffer>;
  /** Test seam for the PTY spawner. */
  readonly spawner?: PtySpawner;
}

const PTY_COLS = 200;
const PTY_ROWS = 50;
const PARSER_IDLE_QUIET_MS = 80;

/**
 * Entrypoint for stream-json shim mode. Spawns a wrapped `claude` via
 * PTY, reads NDJSON user messages from stdin, forwards each to the
 * wrapped session, and translates outgoing TUI events to NDJSON
 * `SDKMessage`s on stdout.
 *
 * Returns a numeric exit code. The caller (CLI bin) translates it via
 * `process.exit`.
 */
export async function runShim(opts: RunShimOptions): Promise<number> {
  const io: ShimIo = opts.io ?? {
    stdout: { write: (line) => process.stdout.write(line) },
    stderr: (msg) => process.stderr.write(msg),
  };

  const claudePath = opts.env.JUNE15_CLAUDE_PATH ?? '';
  const split = splitArgs(opts.argv);

  const sessionId = split.extracted.sessionId ?? split.extracted.resume ?? randomUUID();
  const cwd = split.extracted.cwd ?? process.cwd();
  const model = split.extracted.model ?? 'claude';
  const permissionMode = split.extracted.permissionMode ?? 'bypassPermissions';

  // Load tool defs (built-ins always come first, user files merged on top).
  const envSep = platform() === 'win32' ? ';' : ':';
  const envPaths = (opts.env.JUNE15_TOOL_DEFS ?? '').split(envSep).filter((s) => s.length > 0);
  const dataDir =
    opts.env.JUNE15_DATA_DIR ?? join(homedir(), '.local', 'share', 'june15');
  const configDirCandidate = join(homedir(), '.config', 'june15');

  const toolDefs = loadToolDefs({
    cliPaths: split.extracted.toolDefs,
    envPaths,
    configDir: configDirCandidate,
    io: { warn: (m) => { io.stderr(`${m}\n`); } },
  });
  const synthesizer = ToolInputSynthesizer.fromDefs(toolDefs);

  const writer = new EventToStream({
    sessionId,
    cwd,
    model,
    permissionMode,
    synthesizer,
  });

  // The init line is emitted unconditionally — even before we know if
  // claude is available — so consumers always see a `system/init` first.
  writer.emitInit(io.stdout);

  if (claudePath.length === 0 || !existsSync(claudePath)) {
    writer.emitStartupError(
      io.stdout,
      claudePath.length === 0
        ? 'JUNE15_CLAUDE_PATH is not set'
        : `JUNE15_CLAUDE_PATH points to a non-existent path: ${claudePath}`,
    );
    return 1;
  }

  // Per-session upload directory. Created lazily — only matters if the
  // caller sends image attachments.
  const uploadsRoot = join(dataDir, 'uploads', sessionId);
  mkdirSync(uploadsRoot, { recursive: true });
  const uploads: UploadStoreType = new UploadStore(uploadsRoot);

  // Build the claude argv. Caller args win — defaults are only added if
  // the caller didn't already supply them.
  const args = buildClaudeArgs({
    passthrough: split.passthrough,
    addDirs: split.extracted.addDirs,
    cwd,
    uploadsRoot,
  });

  const conv = assembleConversation({
    id: sessionId,
    claudePath,
    args,
    cwd,
    env: opts.env,
    cols: PTY_COLS,
    rows: PTY_ROWS,
    idleQuietMs: PARSER_IDLE_QUIET_MS,
    ...(opts.spawner ? { spawner: opts.spawner } : {}),
  });

  // Pipe Conversation events → writer. `message_started` is the
  // authoritative "new turn began on the PTY" signal — beginTurn() must
  // run BEFORE any text_delta of that turn is forwarded.
  const pendingCompletions = new Set<string>();
  let resolveIdle: (() => void) | null = null;
  const wakeIfIdle = (): void => {
    if (pendingCompletions.size === 0 && resolveIdle) {
      const r = resolveIdle;
      resolveIdle = null;
      r();
    }
  };
  const unsubscribe = conv.onEvent((e) => {
    if (e.type === 'message_started') {
      writer.beginTurn();
      return;
    }
    writer.onEvent(e, io.stdout);
    if (e.type === 'message_completed') {
      pendingCompletions.delete(e.messageId);
      wakeIfIdle();
    }
    if (e.type === 'pty_exited') {
      pendingCompletions.clear();
      wakeIfIdle();
    }
  });

  // Drive stdin. Each parsed user message is sent — `Conversation.send`
  // enqueues if a previous turn is still in flight; the wrapped PTY
  // drains the queue one turn at a time and emits message_started /
  // turn_complete events that drive `writer`'s turn boundaries.
  let exitCode = 0;
  try {
    await conv.waitForReady(30_000);
    for await (const msg of readUserInputs(
      opts.stdin ?? (process.stdin as AsyncIterable<Buffer>),
      { uploads, warn: (m) => { io.stderr(`${m}\n`); } },
    )) {
      const id = sendInput(conv, msg);
      pendingCompletions.add(id);
    }
    // Stdin is closed; drain every in-flight + queued turn before we
    // tear down. The wrapped PTY's parser is debounced — without this
    // wait, killing the PTY mid-turn would lose the final `result`.
    if (pendingCompletions.size > 0) {
      await new Promise<void>((resolve) => { resolveIdle = resolve; });
    }
  } catch (err) {
    writer.emitStartupError(io.stdout, `shim: ${(err as Error).message}`);
    exitCode = 1;
  } finally {
    unsubscribe();
    conv.kill();
  }
  return exitCode;
}

interface BuildArgsInput {
  readonly passthrough: readonly string[];
  readonly addDirs: readonly string[];
  readonly cwd: string;
  readonly uploadsRoot: string;
}

function buildClaudeArgs(input: BuildArgsInput): readonly string[] {
  const out = [...input.passthrough];
  // Inject --add-dir for cwd if the caller didn't provide it. Same for
  // the per-session uploads dir, but only when not already covered.
  const has = (dir: string): boolean => input.addDirs.some((d) => d === dir);
  if (!has(input.cwd)) {
    out.push('--add-dir', input.cwd);
  }
  if (!has(input.uploadsRoot)) {
    out.push('--add-dir', input.uploadsRoot);
  }
  return out;
}

function sendInput(
  conv: { send(t: string): string; sendWithAttachments(i: { text: string; attachments: readonly SavedAttachmentLike[] }): string },
  msg: ParsedUserInput,
): string {
  if (msg.attachments.length === 0) {
    return conv.send(msg.text);
  }
  return conv.sendWithAttachments({ text: msg.text, attachments: msg.attachments });
}

// Local type alias — avoids importing the full SavedAttachment surface
// just to satisfy the call shape.
type SavedAttachmentLike = ParsedUserInput['attachments'][number];
