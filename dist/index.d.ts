import { z } from 'zod';
import { Logger } from 'pino';
export { Logger } from 'pino';
import { Hono } from 'hono';

declare const LoggerConfigSchema: z.ZodDefault<z.ZodObject<{
    level: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
    pretty: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
    pretty?: boolean | undefined;
}, {
    level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
    pretty?: boolean | undefined;
}>>;
declare const ModeSchema: z.ZodEnum<["interactive", "headless"]>;
declare const ConfigSchema: z.ZodObject<{
    mode: z.ZodOptional<z.ZodEnum<["interactive", "headless"]>>;
    dataDir: z.ZodOptional<z.ZodString>;
    server: z.ZodDefault<z.ZodObject<{
        host: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
        auth: z.ZodDefault<z.ZodObject<{
            bearerToken: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            bearerToken?: string | undefined;
        }, {
            bearerToken?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
        auth: {
            bearerToken?: string | undefined;
        };
    }, {
        host?: string | undefined;
        port?: number | undefined;
        auth?: {
            bearerToken?: string | undefined;
        } | undefined;
    }>>;
    claude: z.ZodDefault<z.ZodObject<{
        path: z.ZodOptional<z.ZodString>;
        autoInstall: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        autoInstall: boolean;
        path?: string | undefined;
    }, {
        path?: string | undefined;
        autoInstall?: boolean | undefined;
    }>>;
    pty: z.ZodDefault<z.ZodObject<{
        cols: z.ZodDefault<z.ZodNumber>;
        rows: z.ZodDefault<z.ZodNumber>;
        idleQuietMs: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        cols: number;
        rows: number;
        idleQuietMs: number;
    }, {
        cols?: number | undefined;
        rows?: number | undefined;
        idleQuietMs?: number | undefined;
    }>>;
    logger: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["fatal", "error", "warn", "info", "debug", "trace"]>>;
        pretty: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
        pretty?: boolean | undefined;
    }, {
        level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
        pretty?: boolean | undefined;
    }>>;
    limits: z.ZodDefault<z.ZodObject<{
        maxConversations: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        maxConversations: number;
    }, {
        maxConversations?: number | undefined;
    }>>;
    ui: z.ZodDefault<z.ZodObject<{
        /** When true, june1815 serves the bundled chat UI from `dist/ui/`. */
        enabled: z.ZodDefault<z.ZodBoolean>;
        /** Override the path to the built UI directory. Default is the
         *  package-relative `dist/ui` which the published tarball ships. */
        distDir: z.ZodOptional<z.ZodString>;
        /** When true, the cookie planted by the bearer middleware omits the
         *  `Secure` flag so it works over plain HTTP. Default true (june1815 is
         *  typically bound to 127.0.0.1). Set false behind TLS. */
        cookieInsecure: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        enabled: boolean;
        cookieInsecure: boolean;
        distDir?: string | undefined;
    }, {
        enabled?: boolean | undefined;
        distDir?: string | undefined;
        cookieInsecure?: boolean | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    server: {
        host: string;
        port: number;
        auth: {
            bearerToken?: string | undefined;
        };
    };
    claude: {
        autoInstall: boolean;
        path?: string | undefined;
    };
    pty: {
        cols: number;
        rows: number;
        idleQuietMs: number;
    };
    logger: {
        level: "fatal" | "error" | "warn" | "info" | "debug" | "trace";
        pretty?: boolean | undefined;
    };
    limits: {
        maxConversations: number;
    };
    ui: {
        enabled: boolean;
        cookieInsecure: boolean;
        distDir?: string | undefined;
    };
    mode?: "interactive" | "headless" | undefined;
    dataDir?: string | undefined;
}, {
    mode?: "interactive" | "headless" | undefined;
    dataDir?: string | undefined;
    server?: {
        host?: string | undefined;
        port?: number | undefined;
        auth?: {
            bearerToken?: string | undefined;
        } | undefined;
    } | undefined;
    claude?: {
        path?: string | undefined;
        autoInstall?: boolean | undefined;
    } | undefined;
    pty?: {
        cols?: number | undefined;
        rows?: number | undefined;
        idleQuietMs?: number | undefined;
    } | undefined;
    logger?: {
        level?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | undefined;
        pretty?: boolean | undefined;
    } | undefined;
    limits?: {
        maxConversations?: number | undefined;
    } | undefined;
    ui?: {
        enabled?: boolean | undefined;
        distDir?: string | undefined;
        cookieInsecure?: boolean | undefined;
    } | undefined;
}>;
type Config = z.infer<typeof ConfigSchema>;
type LoggerConfig = z.infer<typeof LoggerConfigSchema>;
type Mode = z.infer<typeof ModeSchema>;

/** Minimal filesystem facade so the loader is fully unit-testable. */
interface FsFacade {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
}
interface LoaderInput {
    /**
     * Nested partial config produced by the CLI layer from commander options.
     * Highest precedence.
     */
    cliOverrides?: DeepPartial<Config>;
    /** Defaults to `process.env`. */
    env?: NodeJS.ProcessEnv;
    /** Defaults to `process.cwd()`. */
    cwd?: string;
    /** Defaults to `os.homedir()`. */
    homeDir?: string;
    /** Optional explicit path to a YAML config; takes the project-yaml slot. */
    configPath?: string;
    /** Filesystem facade. Defaults to the real fs. */
    fs?: FsFacade;
}
type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
/**
 * Resolve the final, validated config. Precedence (high to low):
 *  1. cliOverrides
 *  2. process.env (mapped via ENV_KEYS)
 *  3. ./june1815.yml  (or `configPath` if provided)
 *  4. ~/.config/june1815/june1815.yml
 *  5. ConfigSchema defaults
 */
declare function loadConfig(input?: LoaderInput): Config;

/**
 * The single source of truth for every environment variable june1815 recognizes.
 *
 * Each entry maps an ENV key to a YAML path (dot-separated, walks the
 * Config tree). The loader uses this list to construct a partial config
 * object from `process.env`; the `gen-env-example` script renders this list
 * into `.env.example` so the file never drifts from the runtime behavior.
 */
type EnvKeyType = 'string' | 'number' | 'boolean';
interface EnvKeyDef {
    /** ENV variable name. Conventionally JUNE1815_ prefix. */
    env: string;
    /** Dot-path into the Config tree (e.g. "server.port"). */
    yaml: string;
    /** Runtime type used by the loader when coercing the raw string value. */
    type: EnvKeyType;
    /** One-line description shown in `.env.example`. */
    description: string;
    /** Optional example value rendered in `.env.example`. */
    example?: string;
    /** Mark values that should be redacted in `config show` output. */
    secret?: boolean;
}
declare const ENV_KEYS: readonly EnvKeyDef[];
/**
 * Helper that returns the EnvKeyDef whose `env` matches the supplied name,
 * or undefined if unknown. Used by `config show` to redact secrets and by
 * documentation tooling.
 */
declare function findEnvKey(name: string): EnvKeyDef | undefined;

interface LoggerOptions {
    level: LoggerConfig['level'];
    pretty: boolean;
}
/**
 * Resolve the effective logger options from a Config + a TTY hint.
 *
 * The TTY hint is a parameter (not read from `process.stdout` directly) so
 * the resolver stays a pure function and is unit-testable without faking
 * global streams.
 */
declare function loggerOptionsFromConfig(config: Config, isStdoutTty: boolean): LoggerOptions;
/**
 * Build a pino logger from the resolved options.
 *
 * - `pretty: true` routes output through `pino-pretty` for human readers.
 * - `pretty: false` emits structured JSON suitable for log aggregation.
 *
 * The function returns the logger immediately; pino's transport workers
 * spawn lazily and do not block.
 */
declare function createLogger(opts: LoggerOptions): Logger;

type LocatorSource = 'override' | 'path' | 'nvm' | 'npm-bin' | 'system';
type LocatorResult = {
    readonly found: true;
    readonly path: string;
    readonly source: LocatorSource;
} | {
    readonly found: false;
    readonly searched: readonly string[];
};
interface LocatorFs {
    existsSync(path: string): boolean;
    isExecutable(path: string): boolean;
    readdirSync(path: string): string[];
}
interface LocatorInput {
    /** Explicit override (from JUNE1815_CLAUDE_PATH or config.claude.path). */
    overridePath?: string | undefined;
    /** The value of $PATH. */
    pathVar?: string | undefined;
    /** User home directory. */
    home?: string;
    /** Platform — `process.platform` by default. */
    platform?: NodeJS.Platform;
    /** Filesystem facade — real fs by default. */
    fs?: LocatorFs;
    /** Binary name to look for. Defaults to `claude` (or `claude.exe` on win32). */
    binaryName?: string;
}
/**
 * Resolve a path to the `claude` executable, walking a prioritized search:
 *   1. explicit override (JUNE1815_CLAUDE_PATH / config.claude.path)
 *   2. every directory on $PATH
 *   3. nvm bin directories (newest Node version first)
 *   4. ~/.npm/bin (npm global prefix default)
 *   5. system-wide locations: /opt/homebrew/bin, /usr/local/bin, /usr/bin, /bin
 *
 * Returns the first existing, executable candidate.
 */
declare function locateClaude(input?: LocatorInput): LocatorResult;
/**
 * An enriched $PATH suitable for spawning child processes that may need to
 * find `claude` themselves (e.g. when running under a stripped login shell).
 * Adds the nvm bin dirs and the npm global bin to the front of the existing
 * PATH so the child shell sees them first.
 */
declare function enrichedPath(input?: LocatorInput): string;

type AuthSource = 'env_oauth' | 'env_anthropic_key' | 'env_claude_key' | 'june1815_token_file' | 'claude_credentials' | 'claude_cli_session' | 'none';
interface AuthInfo {
    readonly authenticated: boolean;
    readonly source: AuthSource;
    /** When source is an env var, the name of the env var. */
    readonly envKey?: string;
    /** When source is a file, the path of the file. */
    readonly path?: string;
    /** Optional metadata surfaced when `source === 'claude_cli_session'`. */
    readonly identity?: {
        readonly email?: string;
        readonly orgName?: string;
        readonly subscriptionType?: string;
        readonly authMethod?: string;
    };
}
interface AuthDetectorFs {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
}
interface AuthDetectorInput {
    /** Defaults to `process.env`. */
    env?: NodeJS.ProcessEnv;
    /** Defaults to `os.homedir()`. */
    homeDir?: string;
    /** Where june1815 stores its token file. Defaults to `<homeDir>/.local/share/june1815`. */
    dataDir?: string;
    /** Filesystem facade — real fs by default. */
    fs?: AuthDetectorFs;
}
/**
 * Resolve which authentication source june1815 should advertise to the user
 * and downstream consumers. The precedence (high to low):
 *
 *   1. CLAUDE_CODE_OAUTH_TOKEN  (env)  — preferred OAuth token
 *   2. ANTHROPIC_API_KEY        (env)
 *   3. CLAUDE_API_KEY           (env)
 *   4. <dataDir>/agent_token.txt — june1815's own token file
 *   5. ~/.claude/.credentials.json — Claude CLI's own credential store
 *   6. none
 *
 * For env vars, presence with non-empty value is sufficient. For files, the
 * file must exist and contain non-whitespace content.
 *
 * Importantly, this function does NOT return the token value — only the
 * source. Tokens never leave their storage; spawned claude processes inherit
 * env or read the file themselves.
 */
declare function detectAuth(input?: AuthDetectorInput): AuthInfo;
/** Spawn facade for the `claude auth status` probe (tests pass a fake). */
interface AuthProbeSpawnFacade {
    run(command: string, args: readonly string[], timeoutMs: number): Promise<{
        readonly code: number;
        readonly stdout: string;
        readonly stderr: string;
    }>;
}

/** Outcome of an install attempt. */
type InstallResult = {
    readonly installed: true;
    readonly command: string;
} | {
    readonly installed: false;
    readonly reason: 'declined' | 'headless_no_consent' | 'spawn_failed';
    readonly details?: string;
};
/** Minimal logger surface the installer needs. */
interface InstallerLog {
    info(message: string): void;
    warn(message: string): void;
}
/** Async confirmation prompt — supplied by the CLI layer (`@clack/prompts`). */
interface ConfirmPrompt {
    confirm(message: string): Promise<boolean>;
}
/** Spawn facade for testability. Returns the exit code; stderr is logged inline. */
interface SpawnFacade {
    run(command: string, args: readonly string[]): Promise<{
        readonly code: number;
        readonly stderr: string;
    }>;
}
interface InstallInput {
    /** Resolved interactive/headless mode. */
    mode: Mode;
    /** When true, headless mode is allowed to install without a prompt. */
    autoInstall: boolean;
    /** Override the spawn implementation (tests). */
    spawnFacade?: SpawnFacade;
    /** Override the confirm prompt (tests / non-clack consumers). */
    prompt?: ConfirmPrompt;
    /** Logger; defaults to console.warn/console.error if absent. */
    log?: InstallerLog;
    /** Override the install command + args (tests). */
    command?: {
        cmd: string;
        args: readonly string[];
    };
}
/**
 * Attempt to install the official `claude` CLI via `npm i -g
 * @anthropic-ai/claude-code`.
 *
 * Decision tree:
 *   headless + !autoInstall  -> refuse (`headless_no_consent`)
 *   headless +  autoInstall  -> run the install
 *   interactive              -> prompt the user; install on yes, decline on no
 *
 * On spawn failure or non-zero exit, returns `{ installed: false, reason:
 * 'spawn_failed' }` with the captured stderr in `details`. The caller is
 * expected to surface a human-readable message and re-run `locateClaude`
 * if `installed: true`.
 */
declare function installClaude(input: InstallInput): Promise<InstallResult>;
/** Convenience wrapper that throws `June1815Error` for non-installed outcomes. */
declare function installOrThrow(input: InstallInput): Promise<void>;

interface VersionInfo {
    readonly raw: string;
    readonly semver: string | null;
    readonly parts: {
        major: number;
        minor: number;
        patch: number;
    } | null;
}
/**
 * Extract a semver from arbitrary `claude --version` output. Tolerates ANSI
 * escape sequences and surrounding chrome — looks for the first
 * X.Y.Z pattern.
 */
declare function parseClaudeVersion(stdout: string): VersionInfo;
/** Spawn facade for testability. */
interface VersionSpawnFacade {
    run(command: string, args: readonly string[]): Promise<{
        readonly code: number;
        readonly stdout: string;
        readonly stderr: string;
    }>;
}
/** Run `<claudePath> --version` and parse the result. */
declare function getClaudeVersion(claudePath: string, spawnFacade?: VersionSpawnFacade): Promise<VersionInfo>;

/** Information emitted when the PTY child process exits. */
interface PtyExit {
    readonly exitCode: number;
    readonly signal: number | null;
}
/** Lifecycle states. */
type PtyState = 'alive' | 'exited';
/** Lower-level PTY operations the wrapper needs. Implemented by node-pty in
 *  production and by tests with a fake handle. */
interface PtyHandle {
    readonly pid: number;
    onData(listener: (data: string) => void): () => void;
    onExit(listener: (info: PtyExit) => void): () => void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
}
interface PtySpawnOptions {
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd: string;
    readonly env: Readonly<NodeJS.ProcessEnv>;
    readonly cols: number;
    readonly rows: number;
}
/** Pluggable spawner. Production uses node-pty; tests pass a fake. */
interface PtySpawner {
    spawn(opts: PtySpawnOptions): PtyHandle;
}
type DataListener = (data: string) => void;
type ExitListener = (info: PtyExit) => void;
/**
 * Higher-level wrapper over `PtyHandle`. Tracks lifecycle state, fans out
 * data and exit events to multiple consumers, and refuses operations on a
 * dead PTY with a typed `June1815Error('pty_dead')`.
 */
declare class ClaudePty {
    private readonly handle;
    private _state;
    private constructor();
    static start(opts: PtySpawnOptions, spawner?: PtySpawner): ClaudePty;
    private readonly dataListeners;
    private readonly exitListeners;
    get pid(): number;
    get state(): PtyState;
    onData(listener: DataListener): () => void;
    onExit(listener: ExitListener): () => void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    private assertAlive;
    private emitData;
    private emitExit;
}

/** Minimal writer surface the driver depends on. */
interface PtyWriter {
    write(data: string): void;
}
/** Configurable keystroke set. Externalized so future TUI revisions can
 *  override individual keys without forking the driver. */
interface InputKeys {
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
/**
 * High-level keystroke driver for the wrapped TUI. Each operation writes a
 * specific sequence to the PTY; nothing reads back. Pair with the parser to
 * confirm side effects.
 */
declare class InputDriver {
    private readonly writer;
    private readonly keys;
    private readonly submitDelayMs;
    private readonly setTimeoutImpl;
    constructor(writer: PtyWriter, keys?: InputKeys, submitDelayMs?: number, setTimeoutImpl?: (cb: () => void, ms: number) => unknown);
    /**
     * Type a message and submit it. Embedded `\n` characters become soft
     * newlines (so multi-line input renders as multiple lines in the TUI
     * before submission), and only the final `submit` keystroke commits.
     *
     * CRITICAL: the entire payload (body with soft newlines + submit) is
     * written in a SINGLE call so claude's TUI treats it as a paste rather
     * than as individual keystrokes. Fragmented writes that contain an
     * `@`-mention cause claude's autocomplete to intercept per-chunk and
     * leave the `@`-mention "pinned" in the input field — the next turn's
     * message gets concatenated with the leftover and never submits, so
     * the conversation hangs in `busy` forever.
     */
    send(text: string): void;
    /**
     * Type a message but do NOT submit it. Useful for staged input where the
     * caller wants to attach a file or insert further chunks before
     * committing. Each line is written separately so callers can observe
     * the TUI's incremental response (e.g. to read autocomplete state
     * between segments).
     */
    typeMessage(text: string): void;
    /**
     * Send a Ctrl-C interrupt. Used to abort an in-flight turn; the queued
     * message slot is unaffected (see the message_queue Alloy spec).
     */
    interrupt(): void;
    /**
     * Steer the in-flight turn by sending an ESC then a new instruction.
     * Behavior depends on the TUI's steer affordance — the prefix is
     * configurable so consumers can disable steering by setting it to ''.
     */
    steer(text: string): void;
    /** Clear the current input line without submitting. */
    clearLine(): void;
    /** Send a raw keystroke sequence. Escape hatch for advanced consumers. */
    raw(data: string): void;
}

/**
 * A point-in-time view of the virtual terminal's buffer. Plain-text only;
 * styling and color information are intentionally dropped because the TUI
 * parser works on textual landmarks.
 */
interface TerminalSnapshot {
    readonly cols: number;
    readonly rows: number;
    /** All buffered lines, INCLUDING scrollback, ordered oldest first. */
    readonly lines: readonly string[];
    /** Index into `lines` of the first visible viewport line. */
    readonly viewportTop: number;
    /** Cursor column (0-based). */
    readonly cursorX: number;
    /** Cursor row in absolute `lines` coordinates (not relative to viewport). */
    readonly cursorY: number;
}
interface TerminalAdapterOptions {
    readonly cols: number;
    readonly rows: number;
    /** Maximum scrollback (lines). Defaults to 1000. */
    readonly scrollback?: number;
}
/**
 * Adapter around `@xterm/headless`. Accepts raw PTY bytes via `write` and
 * exposes a point-in-time snapshot of the rendered screen. The TUI parser
 * (next commits) builds on top of these snapshots.
 *
 * `write` is promise-returning so tests can await each chunk before
 * snapshotting; xterm's parser is async-internally and the data isn't
 * reflected in the buffer until the parse completes.
 */
declare class TerminalAdapter {
    private readonly term;
    constructor(opts: TerminalAdapterOptions);
    get cols(): number;
    get rows(): number;
    write(data: string | Uint8Array): Promise<void>;
    resize(cols: number, rows: number): void;
    snapshot(): TerminalSnapshot;
    dispose(): void;
}

/**
 * Public event vocabulary the TUI parser emits to its consumer
 * (Conversation). Mirrors `src/server/events.ts` plus the
 * `trust_prompt` internal-only signal that the Conversation auto-handles.
 */
type TuiEvent = {
    readonly type: 'ready';
} | {
    readonly type: 'text_delta';
    readonly text: string;
} | {
    readonly type: 'reasoning_delta';
    readonly text: string;
} | {
    readonly type: 'tool_use';
    readonly name: string;
    readonly summary?: string;
} | {
    readonly type: 'tool_result';
    readonly name: string;
    readonly summary: string;
} | {
    readonly type: 'usage';
    readonly inputTokens: number;
    readonly outputTokens: number;
} | {
    readonly type: 'turn_complete';
} | {
    readonly type: 'auth_required';
    readonly url: string;
} | {
    readonly type: 'permission_prompt';
    readonly question: string;
} | {
    readonly type: 'trust_prompt';
} | {
    readonly type: 'onboarding_splash';
} | {
    readonly type: 'onboarding_theme';
} | {
    readonly type: 'onboarding_effort';
} | {
    readonly type: 'error';
    readonly code: string;
    readonly message: string;
};

/**
 * Public TuiParser façade.
 *
 * Delegates to the centralized engine in `./tui/`. This file exists for
 * backwards compatibility — every old consumer (Conversation, tests)
 * keeps importing `TuiParser` and `TuiEvent` from here. New code can
 * import the same names from `./tui` directly.
 *
 * To change parsing behavior, edit `./tui/markers.ts` (line patterns)
 * or `./tui/extractors.ts` (which lines become which events). The code
 * below does not contain parsing logic.
 */

/** Legacy `TuiPatterns` shape kept so existing tests and consumers
 *  that asked for `DEFAULT_PATTERNS.<name>` keep working. New code
 *  should reference `MARKERS` directly. */
interface TuiPatterns {
    readonly readyMarker: RegExp;
    readonly assistantBlockStart: RegExp;
    readonly reasoningBlockStart: RegExp;
    readonly blockEnd: RegExp;
    readonly toolCallLine: RegExp;
    readonly usageLine: RegExp;
    readonly permissionPrompt: RegExp;
    readonly oauthUrl: RegExp;
    readonly trustPrompt: RegExp;
    readonly busyFooter: RegExp;
}
/**
 * The public parser. Holds an engine instance; every method is a
 * one-line delegation. Tests poke this through the same surface as
 * production code.
 */
declare class TuiParser {
    private readonly engine;
    constructor(_patterns?: TuiPatterns);
    reset(): void;
    markTurnStarted(): void;
    /** Back-compat alias. */
    resetTurn(): void;
    parse(snap: TerminalSnapshot): TuiEvent[];
}

/** A message awaiting delivery to a conversation's PTY. */
interface QueuedMessage {
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
declare class MessageQueue {
    private readonly pending;
    private _inFlight;
    enqueue(msg: QueuedMessage): void;
    /** Move the head of the queue into the in-flight slot. Requires the slot
     *  to be empty. Returns the dequeued message, or null if the queue was
     *  empty. */
    dequeue(): QueuedMessage | null;
    /** Mark the current turn as completed. Clears the in-flight slot. */
    complete(): void;
    /** Replace the in-flight message with a steered variant. The queue is
     *  unaffected (Alloy invariant `steerNeverConsumesQueue`). */
    steer(msg: QueuedMessage): void;
    /** Abort the in-flight turn. The queue tail is preserved; only the
     *  in-flight slot is cleared. */
    interrupt(): void;
    /** Read-only view of currently queued messages (head first). */
    get pendingList(): readonly QueuedMessage[];
    get inFlight(): QueuedMessage | null;
    get size(): number;
}

type AttachmentKind = 'image' | 'file';
/** Inbound attachment payload from an API client. */
interface AttachmentInput {
    readonly kind: AttachmentKind;
    /** `data:<mime>;base64,<bytes>` URL. */
    readonly dataUrl: string;
    /** Optional content-type override (defaults to the mime in the data URL). */
    readonly contentType?: string;
    /** Optional client-supplied filename — used to derive the on-disk name. */
    readonly name?: string;
}
/** Stored attachment record, suitable for inlining as `@<path>` in a
 *  message and (eventually) referencing in audit logs. */
interface SavedAttachment {
    readonly kind: AttachmentKind;
    readonly path: string;
    readonly bytes: number;
    readonly contentType: string;
    readonly name: string;
}
interface UploadStoreFs {
    existsSync(path: string): boolean;
    mkdirSync(path: string, options: {
        recursive: boolean;
        mode?: number;
    }): void;
    writeFileSync(path: string, data: Buffer): void;
}
/**
 * Writes user-supplied attachments to a per-message directory under
 * `<uploadsDir>/<messageId>/`. Returns SavedAttachment records the
 * conversation can splice into the outgoing message text as
 * `@<absolute-path>` references — the convention `claude` uses to attach
 * a local file to a turn.
 *
 * The store does NOT serve attachments back to clients; once written, a
 * file's lifetime is tied to its conversation directory and cleaned up
 * when the conversation is destroyed (caller's responsibility for v1).
 */
declare class UploadStore {
    private readonly uploadsDir;
    private readonly fs;
    constructor(uploadsDir: string, fs?: UploadStoreFs);
    get baseDir(): string;
    save(messageId: string, attachment: AttachmentInput, index: number): SavedAttachment;
}

type ConversationState = 'starting' | 'ready' | 'busy' | 'killed';
/** Public event stream type. Adds state-change / pty-exit signals to the
 *  base `TuiEvent` set. */
type ConversationEvent = TuiEvent | {
    readonly type: 'state_change';
    readonly from: ConversationState;
    readonly to: ConversationState;
} | {
    readonly type: 'pty_exited';
    readonly exitCode: number;
    readonly signal: number | null;
} | {
    readonly type: 'message_started';
    readonly messageId: string;
} | {
    readonly type: 'message_completed';
    readonly messageId: string;
};
interface ConversationDeps {
    readonly id: string;
    readonly cwd: string;
    readonly pty: ClaudePty;
    readonly terminal: TerminalAdapter;
    readonly parser: TuiParser;
    readonly driver: InputDriver;
    readonly queue?: MessageQueue;
    readonly idleQuietMs: number;
    readonly maxBurstMs?: number;
    /** Override `setTimeout` / `clearTimeout` for deterministic tests. */
    readonly timers?: ConversationTimers;
}
interface ConversationTimers {
    setTimeout(fn: () => void, ms: number): NodeJS.Timeout | number;
    clearTimeout(handle: NodeJS.Timeout | number): void;
}
/**
 * The unit that wires together PTY + terminal + parser + driver + queue.
 * One per `conversation_id`. Owns the lifecycle and emits a typed event
 * stream to subscribers.
 */
declare class Conversation {
    readonly id: string;
    readonly cwd: string;
    private readonly pty;
    private readonly terminal;
    private readonly parser;
    private readonly driver;
    private readonly queue;
    private readonly idleQuietMs;
    private readonly maxBurstMs;
    private readonly timers;
    private _state;
    private readonly subscribers;
    /** Latched unrecoverable startup diagnostic, replayed to late subscribers. */
    private blockedReason;
    private readonly onboardingDriveCounts;
    private dataTimer;
    private burstTimer;
    private lastWrite;
    private readyResolvers;
    private readyRejecters;
    constructor(deps: ConversationDeps);
    get state(): ConversationState;
    get pendingCount(): number;
    /** Subscribe to events. Returns an unsubscribe function. */
    onEvent(cb: (event: ConversationEvent) => void): () => void;
    /** Wait for the conversation to reach `ready` state. Rejects on
     *  pty_exit or after `timeoutMs`. */
    waitForReady(timeoutMs?: number): Promise<void>;
    /** Enqueue a message; drain immediately if the PTY is idle. Returns the
     *  message id. */
    send(text: string): string;
    /**
     * Send a message with attachments. Each `SavedAttachment` was already
     * written to disk by an `UploadStore`; this method only composes the
     * outgoing text (prepending `@<path>` references per file) and forwards
     * to `send()`. The returned id is the same as if `send()` were called
     * with the composed text.
     */
    sendWithAttachments(input: {
        readonly text: string;
        readonly attachments: readonly SavedAttachment[];
    }): string;
    interrupt(): void;
    /**
     * Steer the in-flight turn — write a new message at the steer prefix and
     * replace the in-flight slot. If nothing is in flight, the behavior
     * degrades gracefully to `send()`.
     */
    steer(text: string): string;
    kill(signal?: string): void;
    /** For tests: take a snapshot now without waiting for idle. */
    snapshotNow(): Promise<void>;
    private onPtyData;
    private onPtyExit;
    private scheduleSnapshot;
    private snapshotInternal;
    private handleParserEvent;
    private driveOnboarding;
    private failStartup;
    private drain;
    private setState;
    private emit;
    private cancelTimers;
}

interface SessionMarkerFs {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
    writeFileSync(path: string, data: string): void;
    mkdirSync(path: string, options: {
        recursive: boolean;
    }): void;
    rmSync(path: string, options: {
        force: boolean;
    }): void;
}
/**
 * Persists each conversation's Claude-side `session_id` to disk so a
 * conversation can be resumed across june1815 restarts via `claude --resume`
 * or `--session-id`.
 *
 * Layout: `<dataDir>/conversations/<conversationId>/session.txt`.
 */
declare class SessionMarkerStore {
    private readonly dataDir;
    private readonly fs;
    constructor(dataDir: string, fs?: SessionMarkerFs);
    private dirFor;
    pathFor(conversationId: string): string;
    read(conversationId: string): string | null;
    write(conversationId: string, sessionId: string): void;
    delete(conversationId: string): void;
}

interface CreateConversationOptions {
    /** Optional client-provided id. Defaults to a random UUID. */
    id?: string;
    /** Working directory for the spawned claude process. */
    cwd: string;
    /** Claude model override, passed via the wrapped CLI. */
    model?: string;
    /** Reasoning effort override. */
    effort?: string;
    /** Text appended to claude's system prompt. */
    systemPromptAppend?: string;
}
/** Factory that knows how to construct a Conversation. Production wires
 *  this to a function that spawns claude under node-pty; tests pass a
 *  fake factory. */
interface ConversationFactory {
    create(opts: {
        id: string;
        cwd: string;
        model?: string;
        effort?: string;
        systemPromptAppend?: string;
        resumeSessionId?: string;
    }): Promise<Conversation>;
}
interface ManagerOptions {
    readonly factory: ConversationFactory;
    readonly markers: SessionMarkerStore;
    readonly maxConversations: number;
}
/**
 * Owns the active set of conversations. Enforces the
 * `maxConversations` cap (per ADR-0002). On delete, the conversation is
 * killed and its session marker is left intact so it can be resumed later.
 */
declare class ConversationManager {
    private readonly opts;
    private readonly conversations;
    constructor(opts: ManagerOptions);
    list(): Conversation[];
    get(id: string): Conversation | undefined;
    size(): number;
    create(opts: CreateConversationOptions): Promise<Conversation>;
    delete(id: string): Promise<void>;
    /** Best-effort shutdown of every conversation. Used at server stop. */
    destroyAll(): Promise<void>;
}

interface ProductionFactoryDeps {
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
declare class ProductionConversationFactory implements ConversationFactory {
    private readonly deps;
    constructor(deps: ProductionFactoryDeps);
    create(opts: {
        id: string;
        cwd: string;
        model?: string;
        effort?: string;
        systemPromptAppend?: string;
        resumeSessionId?: string;
    }): Promise<Conversation>;
}

/** Public surface of the assembled HTTP app. */
interface ServerApp {
    /** The Hono instance — call `fetch(request)` from tests, or hand to a
     *  Node adapter (`@hono/node-server`) for real serving. */
    readonly app: Hono<AppEnv>;
    /** The bearer token currently enforced. Returned so the CLI can print it
     *  in the boot message. */
    readonly bearerToken: string;
}
interface AppEnv {
    Variables: {
        requestId: string;
    };
}
interface AppDependencies {
    /** Logger; receives access logs, errors, etc. */
    readonly log: Logger;
    /** The bearer token enforced on every route except `publicPaths`. */
    readonly bearerToken: string;
    /** Conversation manager used by message/conversation routes (wired in
     *  subsequent commits). */
    readonly conversations: ConversationManager;
    /** Paths that bypass the bearer check entirely. Defaults to ['/healthz']. */
    readonly publicPaths?: readonly string[];
    /** When true (default), the auth cookie omits the Secure flag so it
     *  works over plain HTTP on localhost. Set false behind TLS. */
    readonly cookieInsecure?: boolean;
}
/**
 * Construct the Hono app with the standard middleware stack. Bearer auth
 * is applied globally (covers both the API and any future static UI),
 * with `publicPaths` carving out unauthenticated routes like `/healthz`.
 *
 * Routes are registered by later commits via the `registerXRoutes(app,
 * deps)` helpers exported alongside this factory.
 */
declare function createServer(deps: AppDependencies): ServerApp;

interface TokenStoreFs {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf8'): string;
    writeFileSync(path: string, data: string, options?: {
        mode?: number;
    }): void;
    rmSync(path: string, options: {
        force: boolean;
    }): void;
    mkdirSync(path: string, options: {
        recursive: boolean;
        mode?: number;
    }): void;
}
interface AuthServiceOptions {
    readonly dataDir: string;
    readonly homeDir?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fs?: TokenStoreFs & AuthDetectorFs;
    /** Path to the resolved `claude` binary. When supplied, `status()`
     *  falls back to `claude auth status` if no local source is found. */
    readonly claudePath?: string;
    /** Override the auth probe spawn (tests). */
    readonly probeSpawn?: AuthProbeSpawnFacade;
}
/**
 * Manages june1815's own token file and answers "what's the current auth
 * source?" queries.
 *
 * Resolution order:
 *   1. Local sources — env vars, june1815 token file, ~/.claude/.credentials.json.
 *      Fast, no subprocess.
 *   2. `claude auth status` probe. Catches the case where claude stores
 *      credentials in the macOS Keychain or another OS-managed store
 *      that's invisible from the filesystem.
 *
 * Reading or modifying the token never returns the token value — the file
 * is written and subsequently consumed by spawned claude children.
 */
declare class AuthService {
    private readonly dataDir;
    private readonly homeDir;
    private readonly env;
    private readonly fs;
    private readonly claudePath;
    private readonly probeSpawn;
    private probeCache;
    private static readonly PROBE_TTL_MS;
    constructor(opts: AuthServiceOptions);
    private tokenPath;
    /** Synchronous status — checks local sources only. Returns `none`
     *  when claude's OAuth credentials live somewhere `detectAuth` can't
     *  see (e.g. macOS Keychain). Prefer `status()` for the full answer. */
    statusLocal(): AuthInfo;
    /**
     * Full status: local sources first; if none found, probe
     * `claude auth status` (cached briefly) so OS-keychain credentials are
     * detected too.
     */
    status(): Promise<AuthInfo>;
    setToken(token: string): void;
    clear(): void;
}

interface HealthInfo {
    readonly version: string;
    readonly startedAt: string;
}
declare function registerHealthRoute(app: Hono<AppEnv>, info: HealthInfo): void;

declare function registerAuthRoutes(app: Hono<AppEnv>, deps: {
    auth: AuthService;
}): void;

declare function registerConversationRoutes(app: Hono<AppEnv>, deps: {
    conversations: ConversationManager;
}): void;

interface MessageRouteDeps {
    readonly conversations: ConversationManager;
    /** Optional. When supplied, the messages route accepts attachments. */
    readonly uploadStoreFor?: (conversationId: string) => UploadStore | undefined;
}
declare function registerMessageRoutes(app: Hono<AppEnv>, deps: MessageRouteDeps): void;

/**
 * Typed error hierarchy. Every thrown error in june1815 is one of these.
 * Code numbers are stable strings (not magic ints) so consumers can branch on
 * them without coupling to exception classes.
 */
type June1815ErrorCode = 'config_invalid' | 'config_yaml_parse' | 'config_yaml_read' | 'claude_not_found' | 'claude_install_declined' | 'claude_install_failed' | 'claude_onboarding_required' | 'auth_unavailable' | 'pty_spawn_failed' | 'pty_dead' | 'conversation_not_found' | 'conversation_busy' | 'conversation_limit_reached' | 'http_bad_request' | 'http_unauthorized' | 'shim_no_claude_path' | 'shim_bad_input' | 'tool_defs_invalid';
declare class June1815Error extends Error {
    readonly name = "June1815Error";
    readonly code: June1815ErrorCode;
    readonly details?: Record<string, unknown>;
    constructor(code: June1815ErrorCode, message: string, details?: Record<string, unknown>);
}
declare function isJune1815Error(e: unknown): e is June1815Error;

export { type AuthInfo, AuthService, type AuthSource, type Config, ConfigSchema, Conversation, type ConversationEvent, ConversationManager, type ConversationState, ENV_KEYS, June1815Error, type June1815ErrorCode, type LocatorResult, type LocatorSource, type LoggerOptions, MessageQueue, type Mode, ProductionConversationFactory, SessionMarkerStore, createLogger, createServer, detectAuth, enrichedPath, findEnvKey, getClaudeVersion, installClaude, installOrThrow, isJune1815Error, loadConfig, locateClaude, loggerOptionsFromConfig, parseClaudeVersion, registerAuthRoutes, registerConversationRoutes, registerHealthRoute, registerMessageRoutes };
