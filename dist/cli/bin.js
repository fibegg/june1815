#!/usr/bin/env node
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Command, Option } from 'commander';
import { randomUUID, randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, accessSync, constants, rmSync, statSync } from 'fs';
import { platform, homedir } from 'os';
import { join, dirname as dirname$1, delimiter, resolve, normalize, sep, extname } from 'path';
import { fileURLToPath as fileURLToPath$1 } from 'url';
import pino from 'pino';
import { serve } from '@hono/node-server';
import { z } from 'zod';
import jsYaml from 'js-yaml';
import { spawn, execSync } from 'child_process';
import * as XtermHeadless from '@xterm/headless';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as clack from '@clack/prompts';

const require$1 = createRequire(import.meta.url);
const __filename$1 = fileURLToPath(import.meta.url);
dirname(__filename$1);
var __require = /* @__PURE__ */ ((x) => typeof require$1 !== "undefined" ? require$1 : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require$1 !== "undefined" ? require$1 : a)[b]
}) : x)(function(x) {
  if (typeof require$1 !== "undefined") return require$1.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// src/cli/exit-codes.ts
var ExitCode = Object.freeze({
  /** Normal successful exit. */
  Ok: 0,
  /** Generic / uncategorized error. */
  Error: 1,
  /** Caller-supplied input was invalid (bad flag, bad config). */
  BadInput: 2,
  /** `claude` is not on PATH and the user/runtime declined install. */
  ClaudeNotFound: 10,
  /** Install of claude was attempted but failed. */
  ClaudeInstallFailed: 11,
  /** No authentication source could be resolved. */
  AuthUnavailable: 20,
  /** Failed to bind the HTTP listener. */
  ServerBindFailed: 30,
  /** PTY subsystem failed catastrophically (e.g. node-pty unloadable). */
  PtyUnavailable: 31,
  /** SIGINT (user pressed Ctrl-C). */
  Interrupted: 130
});

// src/errors.ts
var June1815Error = class extends Error {
  name = "June1815Error";
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.code = code;
    if (details !== void 0) this.details = details;
  }
};
function isJune1815Error(e) {
  return e instanceof June1815Error;
}

// src/cli/cli.ts
var EXIT_CODE_FOR_ERROR = {
  config_invalid: ExitCode.BadInput,
  config_yaml_parse: ExitCode.BadInput,
  config_yaml_read: ExitCode.BadInput,
  claude_not_found: ExitCode.ClaudeNotFound,
  claude_install_declined: ExitCode.ClaudeNotFound,
  claude_install_failed: ExitCode.ClaudeInstallFailed,
  auth_unavailable: ExitCode.AuthUnavailable,
  pty_spawn_failed: ExitCode.PtyUnavailable,
  pty_dead: ExitCode.PtyUnavailable,
  http_bad_request: ExitCode.BadInput,
  http_unauthorized: ExitCode.AuthUnavailable,
  shim_no_claude_path: ExitCode.ClaudeNotFound,
  shim_bad_input: ExitCode.BadInput,
  tool_defs_invalid: ExitCode.BadInput
};
var realIo = {
  stdout: (s) => process.stdout.write(s),
  stderr: (s) => process.stderr.write(s),
  exit: (code) => {
    process.exit(code);
  }
};
async function runCli(argv2, opts) {
  const io = opts.io ?? realIo;
  const program = new Command();
  program.name("june1815").description("Wrap the Claude CLI TUI via PTY and expose it as an HTTP app-server.").version(opts.version, "-v, --version", "output the package version").showHelpAfterError().exitOverride((err) => {
    const code = err.exitCode === 0 ? ExitCode.Ok : ExitCode.BadInput;
    io.exit(code);
  });
  for (const registrar of opts.registrars) registrar(program, io);
  try {
    await program.parseAsync(argv2);
  } catch (err) {
    if (isJune1815Error(err)) {
      const code = EXIT_CODE_FOR_ERROR[err.code] ?? ExitCode.Error;
      io.stderr(`error [${err.code}]: ${err.message}
`);
      io.exit(code);
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`error: ${message}
`);
    io.exit(ExitCode.Error);
  }
}
function applyCommonOptions(cmd) {
  return cmd.option("--config <path>", "path to a june1815.yml config file (overrides ./june1815.yml)").option("--data-dir <path>", "override JUNE1815_DATA_DIR").option("--log-level <level>", "pino log level: fatal|error|warn|info|debug|trace").addOption(new Option("--headless", "force headless mode").conflicts("interactive")).addOption(new Option("--interactive", "force interactive mode").conflicts("headless"));
}
function commonOptionsToConfig(opts) {
  const out = {};
  if (opts.dataDir) out.dataDir = opts.dataDir;
  if (opts.logLevel) out.logger = { level: opts.logLevel };
  if (opts.headless === true) out.mode = "headless";
  if (opts.interactive === true) out.mode = "interactive";
  return out;
}

// src/config/env-keys.ts
var ENV_KEYS = Object.freeze([
  {
    env: "JUNE1815_MODE",
    yaml: "mode",
    type: "string",
    description: "UX mode: interactive (TTY prompts) or headless (no prompts).",
    example: "interactive"
  },
  {
    env: "JUNE1815_DATA_DIR",
    yaml: "dataDir",
    type: "string",
    description: "Conversation state and session markers location.",
    example: "~/.local/share/june1815"
  },
  {
    env: "JUNE1815_HOST",
    yaml: "server.host",
    type: "string",
    description: "HTTP bind address. Use 0.0.0.0 to expose beyond localhost.",
    example: "127.0.0.1"
  },
  {
    env: "JUNE1815_PORT",
    yaml: "server.port",
    type: "number",
    description: "HTTP listen port.",
    example: "7150"
  },
  {
    env: "JUNE1815_BEARER_TOKEN",
    yaml: "server.auth.bearerToken",
    type: "string",
    description: "Bearer token required on all /v1/* write endpoints. Auto-generated at first boot if unset.",
    example: "replace-me-with-a-random-32-char-string",
    secret: true
  },
  {
    env: "JUNE1815_AUTO_INSTALL",
    yaml: "claude.autoInstall",
    type: "boolean",
    description: "Permit headless installation of `claude` via `npm i -g @anthropic-ai/claude-code`.",
    example: "false"
  },
  {
    env: "JUNE1815_CLAUDE_PATH",
    yaml: "claude.path",
    type: "string",
    description: "Explicit path to the `claude` executable. Overrides PATH lookup.",
    example: "/usr/local/bin/claude"
  },
  {
    env: "JUNE1815_PTY_COLS",
    yaml: "pty.cols",
    type: "number",
    description: "PTY width. Wider PTY reduces line-wrap noise in the TUI parser.",
    example: "200"
  },
  {
    env: "JUNE1815_PTY_ROWS",
    yaml: "pty.rows",
    type: "number",
    description: "PTY height. Tall enough to hold reasoning + tool blocks.",
    example: "50"
  },
  {
    env: "JUNE1815_PTY_IDLE_QUIET_MS",
    yaml: "pty.idleQuietMs",
    type: "number",
    description: "Quiet period in ms before the TUI parser snapshots the screen.",
    example: "10"
  },
  {
    env: "JUNE1815_LOG_LEVEL",
    yaml: "logger.level",
    type: "string",
    description: "pino log level: fatal | error | warn | info | debug | trace.",
    example: "info"
  },
  {
    env: "JUNE1815_LOG_PRETTY",
    yaml: "logger.pretty",
    type: "boolean",
    description: "Force human-readable log output. Default: true in interactive mode.",
    example: "true"
  },
  {
    env: "JUNE1815_MAX_CONVERSATIONS",
    yaml: "limits.maxConversations",
    type: "number",
    description: "Maximum concurrent conversations (each runs its own `claude` child).",
    example: "8"
  },
  {
    env: "JUNE1815_UI_ENABLED",
    yaml: "ui.enabled",
    type: "boolean",
    description: "Serve the bundled chat UI at `/`. Disabled by default.",
    example: "false"
  },
  {
    env: "JUNE1815_UI_DIST_DIR",
    yaml: "ui.distDir",
    type: "string",
    description: "Override path to the built UI directory. Defaults to dist/ui inside the package.",
    example: "/opt/june1815/dist/ui"
  },
  {
    env: "JUNE1815_UI_COOKIE_INSECURE",
    yaml: "ui.cookieInsecure",
    type: "boolean",
    description: "Omit Secure flag on the auth cookie so it works over plain HTTP. Set false behind TLS.",
    example: "true"
  }
]);
var ServerConfigSchema = z.object({
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(7150),
  auth: z.object({
    bearerToken: z.string().min(16).optional()
  }).default({})
}).default({});
var ClaudeConfigSchema = z.object({
  path: z.string().optional(),
  autoInstall: z.boolean().default(false)
}).default({});
var PtyConfigSchema = z.object({
  cols: z.number().int().min(80).max(500).default(200),
  rows: z.number().int().min(20).max(200).default(50),
  idleQuietMs: z.number().int().min(1).max(1e3).default(10)
}).default({});
var LoggerConfigSchema = z.object({
  level: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  pretty: z.boolean().optional()
}).default({});
var LimitsConfigSchema = z.object({
  maxConversations: z.number().int().min(1).max(64).default(8)
}).default({});
var UiConfigSchema = z.object({
  /** When true, june1815 serves the bundled chat UI from `dist/ui/`. */
  enabled: z.boolean().default(false),
  /** Override the path to the built UI directory. Default is the
   *  package-relative `dist/ui` which the published tarball ships. */
  distDir: z.string().optional(),
  /** When true, the cookie planted by the bearer middleware omits the
   *  `Secure` flag so it works over plain HTTP. Default true (june1815 is
   *  typically bound to 127.0.0.1). Set false behind TLS. */
  cookieInsecure: z.boolean().default(true)
}).default({});
var ModeSchema = z.enum(["interactive", "headless"]);
var ConfigSchema = z.object({
  mode: ModeSchema.optional(),
  dataDir: z.string().optional(),
  server: ServerConfigSchema,
  claude: ClaudeConfigSchema,
  pty: PtyConfigSchema,
  logger: LoggerConfigSchema,
  limits: LimitsConfigSchema,
  ui: UiConfigSchema
}).strict();
function parseYaml(content, source) {
  if (content.trim().length === 0) return {};
  let parsed;
  try {
    parsed = jsYaml.load(content);
  } catch (err) {
    throw new June1815Error(
      "config_yaml_parse",
      `failed to parse YAML from ${source}: ${err.message}`,
      { source }
    );
  }
  if (parsed == null) return {};
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new June1815Error(
      "config_yaml_parse",
      `YAML at ${source} must be a mapping at the root; got ${Array.isArray(parsed) ? "array" : typeof parsed}`,
      { source }
    );
  }
  return parsed;
}

// src/config/loader.ts
var realFs = {
  existsSync,
  readFileSync: (p, e) => readFileSync(p, e)
};
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepMerge(base, over) {
  const result = { ...base };
  for (const [key, overValue] of Object.entries(over)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(overValue)) {
      result[key] = deepMerge(baseValue, overValue);
    } else {
      result[key] = overValue;
    }
  }
  return result;
}
function coerce(raw, type) {
  switch (type) {
    case "string":
      return raw;
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case "boolean": {
      const v = raw.toLowerCase().trim();
      if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
      if (v === "0" || v === "false" || v === "no" || v === "off") return false;
      return raw;
    }
  }
}
function setDeep(target, dotPath, value) {
  const parts = dotPath.split(".");
  if (parts.length === 0) return;
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i] ?? "";
    const next = cursor[key];
    if (isPlainObject(next)) {
      cursor = next;
    } else {
      const fresh = {};
      cursor[key] = fresh;
      cursor = fresh;
    }
  }
  const lastKey = parts[parts.length - 1] ?? "";
  cursor[lastKey] = value;
}
function envToPartial(env) {
  const out = {};
  for (const def of ENV_KEYS) {
    const raw = env[def.env];
    if (raw === void 0) continue;
    if (raw.trim().length === 0) continue;
    setDeep(out, def.yaml, coerce(raw, def.type));
  }
  return out;
}
function loadYamlFile(path, fs) {
  if (!fs.existsSync(path)) return {};
  let content;
  try {
    content = fs.readFileSync(path, "utf8");
  } catch (err) {
    throw new June1815Error("config_yaml_read", `failed to read ${path}: ${err.message}`, {
      path
    });
  }
  return parseYaml(content, path);
}
function loadConfig(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const home = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const fs = input.fs ?? realFs;
  const projectYamlPath = input.configPath ?? join(cwd, "june1815.yml");
  const userYamlPath = join(home, ".config", "june1815", "june1815.yml");
  const userYaml = loadYamlFile(userYamlPath, fs);
  const projectYaml = loadYamlFile(projectYamlPath, fs);
  const envPartial = envToPartial(env);
  const cliPartial = input.cliOverrides ?? {};
  const merged = deepMerge(
    deepMerge(deepMerge(userYaml, projectYaml), envPartial),
    cliPartial
  );
  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw configError(parsed.error);
  }
  return parsed.data;
}
function configError(zodErr) {
  const issues = zodErr.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return new June1815Error("config_invalid", `config validation failed: ${issues}`, {
    issues: zodErr.issues
  });
}
function loggerOptionsFromConfig(config, isStdoutTty) {
  const effectiveMode2 = config.mode ?? (isStdoutTty ? "interactive" : "headless");
  const pretty = config.logger.pretty ?? effectiveMode2 === "interactive";
  return { level: config.logger.level, pretty };
}
function createLogger(opts) {
  const base = {
    level: opts.level,
    base: { name: "june1815" },
    timestamp: pino.stdTimeFunctions.isoTime
  };
  if (opts.pretty) {
    return pino({
      ...base,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname,name",
          messageFormat: "{msg}"
        }
      }
    });
  }
  return pino(base);
}
var realFs2 = {
  existsSync: existsSync,
  isExecutable: (p) => {
    try {
      accessSync(p, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  },
  readdirSync
};
var SYSTEM_BIN_DIRS = Object.freeze([
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
  "/bin"
]);
function semverCompareDesc(a, b) {
  const ap = a.replace(/^v/, "").split(".").map(Number);
  const bp = b.replace(/^v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(ap.length, bp.length); i += 1) {
    const diff = (bp[i] ?? 0) - (ap[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
function findNvmBinDirs(home, fs) {
  const nvmDir = join(home, ".nvm", "versions", "node");
  if (!fs.existsSync(nvmDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(nvmDir);
  } catch {
    return [];
  }
  return entries.filter((e) => /^v\d+/.test(e)).sort(semverCompareDesc).map((e) => join(nvmDir, e, "bin"));
}
function locateClaude(input = {}) {
  const fs = input.fs ?? realFs2;
  const home = input.home ?? homedir();
  const plat = input.platform ?? platform();
  const binaryName = input.binaryName ?? (plat === "win32" ? "claude.exe" : "claude");
  const pathSep = plat === "win32" ? ";" : delimiter;
  const searched = [];
  const candidates = [];
  if (input.overridePath && input.overridePath.trim().length > 0) {
    candidates.push({ path: input.overridePath, source: "override" });
  }
  const pathVar = input.pathVar ?? "";
  if (pathVar.length > 0) {
    for (const dir of pathVar.split(pathSep)) {
      const trimmed = dir.trim();
      if (trimmed.length === 0) continue;
      candidates.push({ path: join(trimmed, binaryName), source: "path" });
    }
  }
  for (const nvmBin of findNvmBinDirs(home, fs)) {
    candidates.push({ path: join(nvmBin, binaryName), source: "nvm" });
  }
  candidates.push({ path: join(home, ".npm", "bin", binaryName), source: "npm-bin" });
  for (const sysDir of SYSTEM_BIN_DIRS) {
    candidates.push({ path: join(sysDir, binaryName), source: "system" });
  }
  const seen = /* @__PURE__ */ new Set();
  for (const c of candidates) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    searched.push(c.path);
    if (fs.existsSync(c.path) && fs.isExecutable(c.path)) {
      return { found: true, path: c.path, source: c.source };
    }
  }
  return { found: false, searched };
}
function enrichedPath(input = {}) {
  const fs = input.fs ?? realFs2;
  const home = input.home ?? homedir();
  const plat = input.platform ?? platform();
  const sep2 = plat === "win32" ? ";" : delimiter;
  const original = input.pathVar ?? "";
  const extra = [];
  extra.push(...findNvmBinDirs(home, fs));
  extra.push(join(home, ".npm", "bin"));
  for (const dir of SYSTEM_BIN_DIRS) extra.push(dir);
  const seen = /* @__PURE__ */ new Set();
  const parts = [...extra, ...original.split(sep2)].filter((p) => {
    if (p.length === 0) return false;
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  return parts.join(sep2);
}
var realSpawn = {
  run: (cmd, args) => new Promise((resolve2) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve2({ code: code ?? 1, stderr });
    });
    child.on("error", (err) => {
      resolve2({ code: -1, stderr: err.message });
    });
  })
};
var DEFAULT_INSTALL_CMD = "npm";
var DEFAULT_INSTALL_ARGS = ["i", "-g", "@anthropic-ai/claude-code"];
async function installClaude(input) {
  const spawnFacade = input.spawnFacade ?? realSpawn;
  const cmd = input.command?.cmd ?? DEFAULT_INSTALL_CMD;
  const args = input.command?.args ?? DEFAULT_INSTALL_ARGS;
  const display = `${cmd} ${args.join(" ")}`;
  if (input.mode === "headless" && !input.autoInstall) {
    input.log?.warn(
      `\`claude\` not found and headless mode forbids unattended install. Set JUNE1815_AUTO_INSTALL=1 or pass --auto-install to permit it, or run \`${display}\` manually.`
    );
    return { installed: false, reason: "headless_no_consent" };
  }
  if (input.mode === "interactive") {
    if (!input.prompt) {
      input.log?.warn("interactive install requested but no prompt facility provided");
      return { installed: false, reason: "declined" };
    }
    const ok = await input.prompt.confirm(
      `\`claude\` is not installed. Install it with \`${display}\`? (recommended)`
    );
    if (!ok) return { installed: false, reason: "declined" };
  }
  input.log?.info(`installing claude: ${display}`);
  const result = await spawnFacade.run(cmd, args);
  if (result.code !== 0) {
    return {
      installed: false,
      reason: "spawn_failed",
      ...result.stderr ? { details: result.stderr } : {}
    };
  }
  return { installed: true, command: display };
}
async function installOrThrow(input) {
  const r = await installClaude(input);
  if (r.installed) return;
  switch (r.reason) {
    case "declined":
      throw new June1815Error("claude_install_declined", "user declined to install claude");
    case "headless_no_consent":
      throw new June1815Error(
        "claude_install_declined",
        "headless mode cannot install claude without --auto-install / JUNE1815_AUTO_INSTALL=1"
      );
    case "spawn_failed":
      throw new June1815Error(
        "claude_install_failed",
        `claude install failed: ${r.details ?? "(no stderr)"}`
      );
  }
}

// src/conversation/queue.ts
var MessageQueue = class {
  pending = [];
  _inFlight = null;
  enqueue(msg) {
    if (this._inFlight?.id === msg.id) {
      throw new Error("message already in flight");
    }
    if (this.pending.some((p) => p.id === msg.id)) {
      throw new Error("duplicate message id");
    }
    this.pending.push(msg);
  }
  /** Move the head of the queue into the in-flight slot. Requires the slot
   *  to be empty. Returns the dequeued message, or null if the queue was
   *  empty. */
  dequeue() {
    if (this._inFlight) throw new Error("dequeue while in-flight is set");
    const head = this.pending.shift();
    if (!head) return null;
    this._inFlight = head;
    return head;
  }
  /** Mark the current turn as completed. Clears the in-flight slot. */
  complete() {
    this._inFlight = null;
  }
  /** Replace the in-flight message with a steered variant. The queue is
   *  unaffected (Alloy invariant `steerNeverConsumesQueue`). */
  steer(msg) {
    if (!this._inFlight) throw new Error("steer with no message in flight");
    this._inFlight = msg;
  }
  /** Abort the in-flight turn. The queue tail is preserved; only the
   *  in-flight slot is cleared. */
  interrupt() {
    this._inFlight = null;
  }
  /** Read-only view of currently queued messages (head first). */
  get pendingList() {
    return this.pending;
  }
  get inFlight() {
    return this._inFlight;
  }
  get size() {
    return this.pending.length + (this._inFlight ? 1 : 0);
  }
};
var realFs3 = {
  existsSync: existsSync,
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  },
  writeFileSync: (p, d) => {
    writeFileSync(p, d);
  }
};
var DATA_URL_RE = /^data:([^;,]+)?(?:;base64)?,(.*)$/s;
var IMAGE_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/bmp": "bmp"
};
function sanitizeFileName(name) {
  const cleaned = name.replace(/[\x00-\x1f/\\:*?"<>|]+/g, "_").replace(/^\.+/, "").trim();
  const limited = cleaned.slice(0, 96);
  return limited.length > 0 ? limited : "unnamed";
}
function inferExt(contentType, kind, fallback) {
  if (kind === "image") {
    const lower = contentType.toLowerCase();
    return IMAGE_EXT[lower] ?? fallback;
  }
  return fallback;
}
function parseDataUrl(dataUrl) {
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) return null;
  const mime = (m[1] ?? "application/octet-stream").trim() || "application/octet-stream";
  const payload = m[2] ?? "";
  const isBase64 = /;base64/i.test(dataUrl.slice(0, dataUrl.indexOf(",")));
  try {
    const bytes = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload));
    return { mime, bytes };
  } catch {
    return null;
  }
}
var UploadStore = class {
  constructor(uploadsDir, fs = realFs3) {
    this.uploadsDir = uploadsDir;
    this.fs = fs;
  }
  uploadsDir;
  fs;
  get baseDir() {
    return this.uploadsDir;
  }
  save(messageId, attachment, index) {
    const parsed = parseDataUrl(attachment.dataUrl);
    if (!parsed) {
      throw new Error("invalid data URL");
    }
    const contentType = attachment.contentType ?? parsed.mime;
    const dirForMessage = join(this.uploadsDir, sanitizeFileName(messageId));
    if (!this.fs.existsSync(dirForMessage)) {
      this.fs.mkdirSync(dirForMessage, { recursive: true, mode: 448 });
    }
    const fallbackExt = attachment.kind === "image" ? "png" : "bin";
    const ext = inferExt(contentType, attachment.kind, fallbackExt);
    const fallbackName = `${attachment.kind === "image" ? "img" : "file"}-${index + 1}.${ext}`;
    const name = attachment.name ? sanitizeFileName(attachment.name) : fallbackName;
    const fullPath = join(dirForMessage, name);
    this.fs.writeFileSync(fullPath, parsed.bytes);
    return {
      kind: attachment.kind,
      path: fullPath,
      bytes: parsed.bytes.length,
      contentType,
      name
    };
  }
};
function composeMessageWithAttachments(text, attachments) {
  if (attachments.length === 0) return text;
  const refs = attachments.map((a) => `@${a.path}`).join(" ");
  return text.length > 0 ? `${refs} ${text}` : refs;
}

// src/conversation/conversation.ts
var realTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => {
    clearTimeout(h);
  }
};
var ONBOARDING_MAX_DRIVES_PER_SCREEN = 3;
var Conversation = class {
  id;
  cwd;
  pty;
  terminal;
  parser;
  driver;
  queue;
  idleQuietMs;
  maxBurstMs;
  timers;
  _state = "starting";
  subscribers = /* @__PURE__ */ new Set();
  /** Latched unrecoverable startup diagnostic, replayed to late subscribers. */
  blockedReason = null;
  onboardingDriveCounts = {
    onboarding_splash: 0,
    onboarding_theme: 0,
    onboarding_effort: 0
  };
  dataTimer = null;
  burstTimer = null;
  lastWrite = Promise.resolve();
  readyResolvers = [];
  readyRejecters = [];
  constructor(deps) {
    this.id = deps.id;
    this.cwd = deps.cwd;
    this.pty = deps.pty;
    this.terminal = deps.terminal;
    this.parser = deps.parser;
    this.driver = deps.driver;
    this.queue = deps.queue ?? new MessageQueue();
    this.idleQuietMs = deps.idleQuietMs;
    this.maxBurstMs = deps.maxBurstMs ?? Math.max(deps.idleQuietMs * 20, 200);
    this.timers = deps.timers ?? realTimers;
    this.pty.onData((d) => {
      this.onPtyData(d);
    });
    this.pty.onExit((info) => {
      this.onPtyExit(info);
    });
  }
  get state() {
    return this._state;
  }
  get pendingCount() {
    return this.queue.size;
  }
  /** Subscribe to events. Returns an unsubscribe function. */
  onEvent(cb) {
    this.subscribers.add(cb);
    if (this.blockedReason) {
      const { code, message } = this.blockedReason;
      try {
        cb({ type: "error", code, message });
      } catch {
      }
    }
    return () => this.subscribers.delete(cb);
  }
  /** Wait for the conversation to reach `ready` state. Rejects on
   *  pty_exit or after `timeoutMs`. */
  waitForReady(timeoutMs = 3e4) {
    if (this._state === "ready" || this._state === "busy") return Promise.resolve();
    if (this._state === "killed") {
      return Promise.reject(new June1815Error("pty_dead", "pty already exited"));
    }
    return new Promise((resolve2, reject) => {
      this.readyResolvers.push(resolve2);
      this.readyRejecters.push(reject);
      const t = this.timers.setTimeout(() => {
        reject(new June1815Error("pty_dead", `timed out after ${timeoutMs}ms waiting for ready`));
      }, timeoutMs);
      const cleanup = () => {
        this.timers.clearTimeout(t);
      };
      this.readyResolvers.push(cleanup);
    });
  }
  /** Enqueue a message; drain immediately if the PTY is idle. Returns the
   *  message id. */
  send(text) {
    if (this._state === "killed") {
      throw new June1815Error("pty_dead", "cannot send to a killed conversation");
    }
    const msg = { id: randomUUID(), text, enqueuedAt: Date.now() };
    this.queue.enqueue(msg);
    this.drain();
    return msg.id;
  }
  /**
   * Send a message with attachments. Each `SavedAttachment` was already
   * written to disk by an `UploadStore`; this method only composes the
   * outgoing text (prepending `@<path>` references per file) and forwards
   * to `send()`. The returned id is the same as if `send()` were called
   * with the composed text.
   */
  sendWithAttachments(input) {
    const composed = composeMessageWithAttachments(input.text, input.attachments);
    return this.send(composed);
  }
  interrupt() {
    if (this._state !== "busy") return;
    this.driver.interrupt();
    this.queue.interrupt();
  }
  /**
   * Steer the in-flight turn — write a new message at the steer prefix and
   * replace the in-flight slot. If nothing is in flight, the behavior
   * degrades gracefully to `send()`.
   */
  steer(text) {
    if (this._state !== "busy") return this.send(text);
    const msg = { id: randomUUID(), text, enqueuedAt: Date.now() };
    this.queue.steer(msg);
    this.driver.steer(text);
    return msg.id;
  }
  kill(signal) {
    if (this._state === "killed") return;
    this.cancelTimers();
    this.setState("killed");
    this.pty.kill(signal);
  }
  /** For tests: take a snapshot now without waiting for idle. */
  snapshotNow() {
    return this.snapshotInternal();
  }
  // -------------------------------------------------------------------------
  onPtyData(data) {
    this.lastWrite = this.lastWrite.then(() => this.terminal.write(data));
    this.scheduleSnapshot();
  }
  onPtyExit(info) {
    this.cancelTimers();
    const wasKilled = this._state === "killed";
    this.setState("killed");
    this.emit({ type: "pty_exited", exitCode: info.exitCode, signal: info.signal });
    if (!wasKilled) {
      for (const reject of this.readyRejecters)
        reject(new June1815Error("pty_dead", `pty exited (code ${info.exitCode}) before ready`));
      this.readyRejecters = [];
      this.readyResolvers = [];
    }
  }
  scheduleSnapshot() {
    if (this.dataTimer !== null) this.timers.clearTimeout(this.dataTimer);
    this.dataTimer = this.timers.setTimeout(() => {
      void this.snapshotInternal();
    }, this.idleQuietMs);
    this.burstTimer ??= this.timers.setTimeout(() => {
      void this.snapshotInternal();
    }, this.maxBurstMs);
  }
  async snapshotInternal() {
    this.cancelTimers();
    await this.lastWrite;
    if (this._state === "killed") return;
    const snap = this.terminal.snapshot();
    const events = this.parser.parse(snap);
    if (process.env.JUNE1815_DEBUG_TUI === "1") {
      const ps = this.parser.engine?.snapshotState?.();
      console.error(
        `[tui-debug] state=${this._state} cursorY=${snap.cursorY} events=${events.map((e) => e.type).join(",") || "none"} inTurn=${ps?.inTurn} hadAct=${ps?.turnHadActivity} lastFooter=${ps?.lastFooter}`
      );
      if (process.env.JUNE1815_DEBUG_TUI_LINES === "1") {
        for (let i = 0; i < snap.lines.length; i += 1) {
          const line = snap.lines[i] ?? "";
          if (line.trim().length === 0) continue;
          console.error(`[tui-line ${i}] ${line}`);
        }
      }
    }
    for (const e of events) this.handleParserEvent(e);
    if (this._state === "busy") {
      this.burstTimer = this.timers.setTimeout(() => {
        void this.snapshotInternal();
      }, this.maxBurstMs);
    }
  }
  handleParserEvent(e) {
    if (e.type === "trust_prompt") {
      this.driver.raw("\r");
      return;
    }
    if (isOnboardingEvent(e) && this._state === "starting") {
      this.driveOnboarding(e.type);
      return;
    }
    if (e.type === "ready" && this._state === "starting") {
      this.blockedReason = null;
      this.setState("ready");
      for (const resolve2 of this.readyResolvers) resolve2();
      this.readyResolvers = [];
      this.readyRejecters = [];
      this.emit(e);
      this.drain();
      return;
    }
    if (e.type === "turn_complete" && this._state === "busy") {
      const inFlightId = this.queue.inFlight?.id;
      this.queue.complete();
      if (inFlightId !== void 0) {
        this.emit({ type: "message_completed", messageId: inFlightId });
      }
      this.setState("ready");
      this.emit(e);
      this.drain();
      return;
    }
    this.emit(e);
  }
  driveOnboarding(type) {
    this.onboardingDriveCounts[type] += 1;
    if (this.onboardingDriveCounts[type] > ONBOARDING_MAX_DRIVES_PER_SCREEN) {
      const message = `claude first-run onboarding did not progress after ${ONBOARDING_MAX_DRIVES_PER_SCREEN} Enter attempts on ${type.replace("onboarding_", "")}`;
      this.failStartup("claude_onboarding_required", message);
      return;
    }
    this.driver.raw("\r");
    if (this.burstTimer !== null) this.timers.clearTimeout(this.burstTimer);
    this.burstTimer = this.timers.setTimeout(() => {
      void this.snapshotInternal();
    }, this.maxBurstMs);
  }
  failStartup(code, message) {
    this.blockedReason = { code, message };
    const err = new June1815Error(code, message);
    for (const reject of this.readyRejecters) reject(err);
    this.readyResolvers = [];
    this.readyRejecters = [];
    this.emit({ type: "error", code, message });
  }
  drain() {
    if (this._state !== "ready") return;
    if (this.queue.inFlight) return;
    const next = this.queue.dequeue();
    if (!next) return;
    this.setState("busy");
    this.parser.markTurnStarted();
    this.emit({ type: "message_started", messageId: next.id });
    this.driver.send(next.text);
  }
  setState(s) {
    if (this._state === s) return;
    const from = this._state;
    this._state = s;
    this.emit({ type: "state_change", from, to: s });
  }
  emit(e) {
    for (const cb of this.subscribers) {
      try {
        cb(e);
      } catch {
      }
    }
  }
  cancelTimers() {
    if (this.dataTimer !== null) {
      this.timers.clearTimeout(this.dataTimer);
      this.dataTimer = null;
    }
    if (this.burstTimer !== null) {
      this.timers.clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
  }
};
function isOnboardingEvent(e) {
  return e.type === "onboarding_splash" || e.type === "onboarding_theme" || e.type === "onboarding_effort";
}

// src/pty/claude-pty.ts
var NodePtySpawner = class {
  spawn(opts) {
    const pty = __require("node-pty");
    const child = pty.spawn(opts.command, [...opts.args ?? []], {
      cwd: opts.cwd,
      env: { ...opts.env },
      cols: opts.cols,
      rows: opts.rows,
      name: "xterm-256color"
    });
    return {
      pid: child.pid,
      onData: (l) => {
        const d = child.onData(l);
        return () => {
          d.dispose();
        };
      },
      onExit: (l) => {
        const d = child.onExit(
          ({ exitCode, signal }) => {
            l({ exitCode, signal: typeof signal === "number" ? signal : null });
          }
        );
        return () => {
          d.dispose();
        };
      },
      write: (data) => {
        child.write(data);
      },
      resize: (c, r) => {
        child.resize(c, r);
      },
      kill: (sig) => {
        child.kill(sig);
      }
    };
  }
};
var ClaudePty = class _ClaudePty {
  constructor(handle, _state) {
    this.handle = handle;
    this._state = _state;
  }
  handle;
  _state;
  static start(opts, spawner = new NodePtySpawner()) {
    let handle;
    try {
      handle = spawner.spawn(opts);
    } catch (err) {
      throw new June1815Error("pty_spawn_failed", `failed to spawn PTY: ${err.message}`, {
        command: opts.command
      });
    }
    const pty = new _ClaudePty(handle, "alive");
    handle.onExit((info) => {
      pty._state = "exited";
      pty.emitExit(info);
    });
    handle.onData((d) => {
      pty.emitData(d);
    });
    return pty;
  }
  dataListeners = /* @__PURE__ */ new Set();
  exitListeners = /* @__PURE__ */ new Set();
  get pid() {
    return this.handle.pid;
  }
  get state() {
    return this._state;
  }
  onData(listener) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }
  onExit(listener) {
    this.exitListeners.add(listener);
    return () => this.exitListeners.delete(listener);
  }
  write(data) {
    this.assertAlive("write");
    this.handle.write(data);
  }
  resize(cols, rows) {
    this.assertAlive("resize");
    this.handle.resize(cols, rows);
  }
  kill(signal) {
    if (this._state === "exited") return;
    this.handle.kill(signal);
  }
  assertAlive(op) {
    if (this._state !== "alive") {
      throw new June1815Error("pty_dead", `cannot ${op} on a PTY that has exited`);
    }
  }
  emitData(data) {
    for (const l of this.dataListeners) l(data);
  }
  emitExit(info) {
    for (const l of this.exitListeners) l(info);
  }
};

// src/pty/input-driver.ts
var DEFAULT_KEYS = Object.freeze({
  submit: "\r",
  newline: "\n",
  interrupt: "",
  clearLine: "",
  steerPrefix: "\x1B"
});
var DEFAULT_SUBMIT_DELAY_MS = 200;
var InputDriver = class {
  constructor(writer, keys = DEFAULT_KEYS, submitDelayMs = DEFAULT_SUBMIT_DELAY_MS, setTimeoutImpl = setTimeout) {
    this.writer = writer;
    this.keys = keys;
    this.submitDelayMs = submitDelayMs;
    this.setTimeoutImpl = setTimeoutImpl;
  }
  writer;
  keys;
  submitDelayMs;
  setTimeoutImpl;
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
  send(text) {
    const body = text.split("\n").join(this.keys.newline);
    this.writer.write(body);
    this.setTimeoutImpl(() => {
      this.writer.write(this.keys.submit);
    }, this.submitDelayMs);
  }
  /**
   * Type a message but do NOT submit it. Useful for staged input where the
   * caller wants to attach a file or insert further chunks before
   * committing. Each line is written separately so callers can observe
   * the TUI's incremental response (e.g. to read autocomplete state
   * between segments).
   */
  typeMessage(text) {
    const parts = text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) this.writer.write(this.keys.newline);
      if (part.length > 0) this.writer.write(part);
    });
  }
  /**
   * Send a Ctrl-C interrupt. Used to abort an in-flight turn; the queued
   * message slot is unaffected (see the message_queue Alloy spec).
   */
  interrupt() {
    this.writer.write(this.keys.interrupt);
  }
  /**
   * Steer the in-flight turn by sending an ESC then a new instruction.
   * Behavior depends on the TUI's steer affordance — the prefix is
   * configurable so consumers can disable steering by setting it to ''.
   */
  steer(text) {
    if (this.keys.steerPrefix.length > 0) this.writer.write(this.keys.steerPrefix);
    this.typeMessage(text);
    this.writer.write(this.keys.submit);
  }
  /** Clear the current input line without submitting. */
  clearLine() {
    this.writer.write(this.keys.clearLine);
  }
  /** Send a raw keystroke sequence. Escape hatch for advanced consumers. */
  raw(data) {
    this.writer.write(data);
  }
};
var XtermCtor = (
  // The cast keeps `.Terminal` optional so the `.default` fallback below
  // stays type-valid: @xterm/headless is CJS at runtime and Node's ESM
  // interop may surface the class on `.default` rather than as a named
  // export, even though the package's types now claim otherwise.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
  XtermHeadless.Terminal ?? XtermHeadless.default?.Terminal
);
if (!XtermCtor) throw new Error("@xterm/headless: Terminal export not found");
var Terminal2 = XtermCtor;
var TerminalAdapter = class {
  term;
  constructor(opts) {
    this.term = new Terminal2({
      cols: opts.cols,
      rows: opts.rows,
      scrollback: opts.scrollback ?? 1e3,
      allowProposedApi: true
    });
  }
  get cols() {
    return this.term.cols;
  }
  get rows() {
    return this.term.rows;
  }
  write(data) {
    return new Promise((resolve2) => {
      this.term.write(data, () => {
        resolve2();
      });
    });
  }
  resize(cols, rows) {
    this.term.resize(cols, rows);
  }
  snapshot() {
    const buf = this.term.buffer.active;
    const lines = [];
    for (let y = 0; y < buf.length; y += 1) {
      const line = buf.getLine(y);
      lines.push(line ? line.translateToString(true) : "");
    }
    return {
      cols: this.term.cols,
      rows: this.term.rows,
      lines,
      viewportTop: buf.viewportY,
      cursorX: buf.cursorX,
      cursorY: buf.baseY + buf.cursorY
    };
  }
  dispose() {
    this.term.dispose();
  }
};

// src/pty/ansi.ts
var OSC_RE = /\x1b\][\s\S]*?(?:\x07|\x1b\\|\x9c)/g;
var ANSI_PATTERN = [
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[\\-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[\\-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?(?:\\u0007|\\u001B\\u005C|\\u009C))",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))"
].join("|");
var ANSI_RE = new RegExp(ANSI_PATTERN, "g");
function stripAnsi(s) {
  return s.replace(OSC_RE, "").replace(ANSI_RE, "");
}
function stripAnsiLines(lines) {
  return lines.map(stripAnsi);
}

// src/pty/tui/markers.ts
var MARKERS = Object.freeze({
  userEcho: {
    name: "userEcho",
    purpose: "Echoed user message: `\u276F <text>` where <text> isn't blank and isn't the `Try \"...\"` placeholder.",
    // We intentionally match BOTH placeholder and real echoes here; the
    // engine uses `userEchoPlaceholder` to subtract out the false ones.
    pattern: /^\s*❯\s+\S/u
  },
  userEchoPlaceholder: {
    name: "userEchoPlaceholder",
    purpose: 'Empty-input box hint: `\u276F Try "refactor <filepath>"`. Looks like a user echo but isn\'t one.',
    pattern: /^\s*❯\s+Try\s+["'<]/u,
    isPlaceholderOnly: true
  },
  assistantStart: {
    name: "assistantStart",
    purpose: "Start of an assistant response or tool-call: `\u23FA <something>` (old TUI) or `\u25CF <something>` (Claude 2.1.177+).",
    pattern: /^\s*[⏺●]\s*(?!(?:low|medium|high|max)\s*·\s*\/effort\b)\S/u
  },
  toolCall: {
    name: "toolCall",
    purpose: "Tool-call rendering: `\u23FA Name(args)` / `\u25CF Name(args)` and newer MCP display `\u25CF server - tool (MCP)(args)`.",
    pattern: /^\s*[⏺●]\s*(?:(?<legacyName>[A-Za-z][A-Za-z0-9_]*)\((?<legacyArgs>[^)]*)\)|(?<server>[A-Za-z][\w-]*)\s+-\s+(?<mcpName>[A-Za-z][\w-]*)\s+\(MCP\)(?:\((?<mcpArgs>.*)\))?)/u
  },
  reasoningStart: {
    name: "reasoningStart",
    purpose: "In-flight reasoning marker: `\u273B <verb>ing\u2026` or `\u273B <verb>ing...`. Excludes past-tense summaries.",
    pattern: /^\s*✻\s+[A-Za-z]+ing\s*(?:…|\.{3})/u
  },
  turnSummary: {
    name: "turnSummary",
    purpose: "Past-tense turn elapsed-time summary: `\u273B Brewed for 2s`, `\u273B Cogitated for 0s`, `\u273B Saut\xE9ed for 1s`. Looks like reasoning but isn't.",
    pattern: new RegExp("^\\s*\u273B\\s+\\p{L}+ed\\s+for\\s+\\d+s", "u")
  },
  effortStatusLine: {
    name: "effortStatusLine",
    purpose: "Right-aligned chrome status showing current effort: `\u25CB low \xB7 /effort`. This is not assistant text or reasoning.",
    pattern: /^\s*[○●◈]\s+(?:low|medium|high|max)\s*·\s*\/effort\b/iu
  },
  tokenStatusLine: {
    name: "tokenStatusLine",
    purpose: "Right-aligned context/token chrome: `26218 tokens`, sometimes duplicated on one rendered line.",
    pattern: /^\s*(?:\d+\s*tokens\s*)+$/iu
  },
  assistantChromeLine: {
    name: "assistantChromeLine",
    purpose: "Standalone assistant/status bullet rendered by newer Claude TUI while a tool/search block is opening.",
    pattern: /^\s*[⏺●]\s*$/u
  },
  subordinate: {
    name: "subordinate",
    purpose: "Nested/result block under another marker: `\u23BF <content>`. Used for tool results, /permissions tips, system notes.",
    pattern: /^\s*⎿/u
  },
  divider: {
    name: "divider",
    purpose: "Horizontal rule between TUI regions: `\u2500` / `\u2501` / `\u2550` repeated 3+ times.",
    pattern: /^\s*[─━═]{3,}/u
  },
  tipLine: {
    name: "tipLine",
    purpose: "Standalone tip text claude periodically renders: `Tip: <...>`.",
    pattern: /^\s*Tip:/iu
  },
  usageLine: {
    name: "usageLine",
    purpose: "Token-usage summary: `Usage: 123 in / 45 out`. Capture groups expose input/output counts.",
    pattern: /Usage:\s*(\d+)\s*in\s*\/\s*(\d+)\s*out/iu
  },
  readyFooter: {
    name: "readyFooter",
    purpose: "Idle TUI footer. Default mode: `? for shortcuts`. Permission modes: `\u23F5\u23F5 bypass permissions on`, `\u23F5 accept edits`, `\u23F5 plan mode on`.",
    pattern: /\?\s*for\s*shortcuts|bypass\s*permissions\s*on|accept\s*edits|plan\s*mode\s*on/iu
  },
  busyFooter: {
    name: "busyFooter",
    purpose: "In-flight TUI footer: `esc to interrupt \u2026`.",
    pattern: /esc\s*to\s*interrupt/iu
  },
  spinnerLine: {
    name: "spinnerLine",
    purpose: "Rotating spinner glyph followed by a verb: `\u2722 Deciphering\u2026`, `\xB7 Simmering\u2026`, `\u280B Loading\u2026`. Decoration only, never content.",
    pattern: /^\s*[✢✳✶✻✽⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏·*]\s+\S/u
  },
  oauthUrl: {
    name: "oauthUrl",
    purpose: "OAuth login URL emitted during `claude auth login`.",
    pattern: /(https?:\/\/[^\s]*claude\.ai[^\s]*)/iu
  },
  trustPrompt: {
    name: "trustPrompt",
    purpose: "Workspace-trust dialog shown on first entry into an unfamiliar directory.",
    pattern: /Quick\s*safety\s*check|trust\s*this\s*folder/iu
  },
  permissionDialog: {
    name: "permissionDialog",
    purpose: "Tool-permission dialog. Strict shape \u2014 must include an action verb at word boundary AND a `?` AND an answer prompt like `(y/N)`, `[Y/n]`, `yes/no`, or `always`.",
    pattern: /\b(?:allow|approve|confirm)\b[^?]*\?\s*(?:\(|\[|yes\b|y\/n|y\s*\/\s*n|always)/iu
  },
  mcpFailureLine: {
    name: "mcpFailureLine",
    purpose: "Footer notice about failed MCP servers: `3 MCP servers failed \xB7 /mcp`.",
    pattern: /^\s*\d+\s*MCP\s*servers/iu
  },
  systemTipLine: {
    name: "systemTipLine",
    purpose: "System-emitted tip rendered under a `\u23BF`: `\u23BF  Tip: Use /permissions to ...`. Subset of `subordinate` and `tipLine`.",
    pattern: /^\s*⎿\s*Tip:/iu
  },
  apiErrorLine: {
    name: "apiErrorLine",
    purpose: "API error surfaced as a subordinate line: `\u23BF  API Error: 400 {...}` or `\u23BF  Error: <msg>`. Capture group 1 is the message.",
    pattern: /⎿\s*(?:API\s*Error|Error):\s*(.+)$/iu
  },
  toolResultLine: {
    name: "toolResultLine",
    purpose: "Tool/file-read result under a `\u23BF`: `\u23BF Read /path/to/file (83 bytes)`. Distinct from `apiErrorLine` and `systemTipLine`.",
    pattern: /^\s*⎿\s+(?!Tip:|API\s*Error|Error)([A-Za-z][\w-]*)\s+(.+)$/u
  },
  onboardingSplash: {
    name: "onboardingSplash",
    purpose: "First-run onboarding splash: `Let's get started.`. Drive by accepting the highlighted default.",
    pattern: /let'?s get started/iu
  },
  onboardingTheme: {
    name: "onboardingTheme",
    purpose: "First-run onboarding theme picker: `Choose the text style...`. Drive by accepting the highlighted default.",
    pattern: /choose the text style/iu
  },
  onboardingEffort: {
    name: "onboardingEffort",
    purpose: "First-run onboarding effort picker: `Effort lets you control...`. Drive by accepting the highlighted default.",
    pattern: /effort lets you control/iu
  }
});
function matches(name, line) {
  return MARKERS[name].pattern.test(line);
}

// src/pty/tui/anchoring.ts
function findLastUserEchoIdx(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (!matches("userEcho", line)) continue;
    if (matches("userEchoPlaceholder", line)) continue;
    return i;
  }
  return -1;
}
function computeAnchor(lines) {
  const idx = findLastUserEchoIdx(lines);
  return Math.max(0, idx + 1);
}

// src/pty/tui/transforms.ts
var trimRightPerLine = (lines) => lines.map((l) => l.replace(/[ \t]+$/u, ""));
var trimEdgeBlanks = (lines) => {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] ?? "").trim().length === 0) start += 1;
  while (end > start && (lines[end - 1] ?? "").trim().length === 0) end -= 1;
  return lines.slice(start, end);
};
var collapseBlankRuns = (lines) => {
  const out = [];
  let blanksInRow = 0;
  for (const line of lines) {
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      blanksInRow += 1;
      if (blanksInRow <= 1) out.push("");
    } else {
      blanksInRow = 0;
      out.push(line);
    }
  }
  return out;
};
function computeDelta(prev, current) {
  if (current === prev) return "";
  if (current.startsWith(prev)) return current.slice(prev.length);
  return current;
}
function stripKnownPrefix(text, prefix) {
  if (prefix.length === 0) return text;
  if (text.startsWith(prefix)) return text.slice(prefix.length).replace(/^\s+/u, "");
  return text;
}

// src/pty/tui/extractors.ts
var TEXT_PIPELINE = [trimRightPerLine, collapseBlankRuns, trimEdgeBlanks];
var TOOL_NAME_SHAPE = /^(?:[A-Z][A-Za-z0-9]*|[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*__[A-Za-z0-9_]+)$/u;
function looksLikeToolName(name) {
  return TOOL_NAME_SHAPE.test(name);
}
var ASSISTANT_TEXT_EXTRACTOR = {
  name: "assistant-text",
  purpose: "Extract the latest assistant response segment under the most recent user echo. Strips tool-call shapes, spinner lines, footer hints, prior-turn echoes, and tip blocks.",
  start: "assistantStart",
  excludeStart: "toolCall",
  findLast: true,
  stops: [
    "userEcho",
    "assistantStart",
    "reasoningStart",
    "turnSummary",
    "effortStatusLine",
    "tokenStatusLine",
    "assistantChromeLine",
    "subordinate",
    "divider",
    "tipLine",
    "usageLine",
    "readyFooter",
    "busyFooter",
    "mcpFailureLine"
  ],
  skips: ["spinnerLine"],
  transforms: TEXT_PIPELINE,
  emit({ text, state }) {
    const cleaned = stripKnownPrefix(text, state.previousTurnFinalText);
    const delta = computeDelta(state.emittedAssistantText, cleaned);
    if (cleaned.length === 0 || delta.length === 0) {
      return { events: [], stateUpdate: {} };
    }
    return {
      events: [{ type: "text_delta", text: delta }],
      stateUpdate: {
        emittedAssistantText: cleaned,
        turnHadActivity: true
      }
    };
  }
};
var REASONING_EXTRACTOR = {
  name: "reasoning",
  purpose: "Extract active-tense reasoning content (`\u273B Thinking\u2026` + body lines below). Emits ONLY when there is real content below the marker, never on the marker alone.",
  start: "reasoningStart",
  stops: [
    "userEcho",
    "assistantStart",
    "reasoningStart",
    "turnSummary",
    "effortStatusLine",
    "tokenStatusLine",
    "assistantChromeLine",
    "subordinate",
    "divider",
    "tipLine",
    "usageLine",
    "readyFooter",
    "busyFooter",
    "mcpFailureLine"
  ],
  skips: ["spinnerLine"],
  transforms: [
    // Drop the leading verb line; only content survives.
    (lines) => lines.length > 0 ? lines.slice(1) : [],
    trimRightPerLine,
    trimEdgeBlanks
  ],
  emit({ text, state }) {
    if (text.length === 0) return { events: [], stateUpdate: {} };
    const delta = computeDelta(state.emittedReasoning, text);
    if (delta.length === 0) return { events: [], stateUpdate: {} };
    return {
      events: [{ type: "reasoning_delta", text: delta }],
      stateUpdate: { emittedReasoning: text, turnHadActivity: true }
    };
  }
};
function currentFooter(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i] ?? "";
    if (matches("busyFooter", line)) return "busy";
    if (matches("readyFooter", line)) return "ready";
  }
  return "unknown";
}
var READY_LINE_EXTRACTOR = {
  name: "ready-and-turn-complete",
  purpose: "Detect end-of-turn from any reliable signal: ready footer return, busy\u2192ready transition, or a past-tense `\u273B Verbed for Ns` summary line. Also emits the cross-turn `ready` event.",
  apply({ lines, state, anchor }) {
    const footer = currentFooter(lines);
    const trustVisible = lines.some((l) => matches("trustPrompt", l));
    let turnSummaryVisible = false;
    for (let i = anchor; i < lines.length; i += 1) {
      if (matches("turnSummary", lines[i] ?? "")) {
        turnSummaryVisible = true;
        break;
      }
    }
    const events = [];
    const update = {};
    if (process.env.JUNE1815_DEBUG_TUI === "1") {
      console.error(
        `[ready-ex] footer=${footer} inTurn=${state.inTurn} hadAct=${state.turnHadActivity} lastFooter=${state.lastFooter} sawBusy=${state.sawBusyInTurn} summary=${turnSummaryVisible}`
      );
    }
    if (footer === "ready" && !trustVisible && !state.readyEmitted) {
      events.push({ type: "ready" });
      update.readyEmitted = true;
    }
    if (footer === "busy") update.sawBusyInTurn = true;
    if (footer !== "unknown") update.lastFooter = footer;
    const sawBusy = state.sawBusyInTurn || footer === "busy" || update.sawBusyInTurn === true;
    const atReadyNow = footer === "ready";
    const lastWasReady = state.lastFooter === "ready" || update.lastFooter === "ready";
    const transitionedToReady = atReadyNow && (sawBusy || state.turnHadActivity) || lastWasReady && sawBusy && state.turnHadActivity || turnSummaryVisible && state.turnHadActivity;
    if (state.inTurn && transitionedToReady) {
      events.push({ type: "turn_complete" });
    }
    return { events, stateUpdate: update };
  }
};
var API_ERROR_EXTRACTOR = {
  name: "api-error",
  purpose: "Emit `error` events for `\u23BF API Error:` / `\u23BF Error:` lines. Dedups across the turn so a repeated render doesn't double-fire.",
  apply({ lines, state }) {
    const events = [];
    const next = new Set(state.emittedErrors);
    for (const line of lines) {
      const m = MARKERS.apiErrorLine.pattern.exec(line);
      if (!m?.[1]) continue;
      const message = m[1].trim();
      if (next.has(message)) continue;
      next.add(message);
      events.push({
        type: "error",
        code: "claude_api_error",
        message
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return {
      events,
      stateUpdate: { emittedErrors: next, turnHadActivity: true }
    };
  }
};
var TOOL_RESULT_EXTRACTOR = {
  name: "tool-result",
  purpose: "Emit `tool_result` for `\u23BF <Name> <summary>` lines (file reads, bash output, etc). Excludes `\u23BF Tip:` and `\u23BF API Error:`.",
  apply({ lines, state, anchor }) {
    const events = [];
    const next = new Set(state.announcedToolResults);
    for (let i = anchor; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const m = MARKERS.toolResultLine.pattern.exec(line);
      if (!m) continue;
      const name = m[1] ?? "";
      if (!looksLikeToolName(name)) continue;
      const sig = `${i}::${line.trim()}`;
      if (next.has(sig)) continue;
      next.add(sig);
      events.push({
        type: "tool_result",
        name,
        summary: (m[2] ?? "").trim()
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return {
      events,
      stateUpdate: { announcedToolResults: next, turnHadActivity: true }
    };
  }
};
var TRUST_PROMPT_EXTRACTOR = {
  name: "trust-prompt",
  purpose: "Emit `trust_prompt` once when the workspace-trust dialog is visible.",
  apply({ lines, state }) {
    const trustVisible = lines.some((l) => matches("trustPrompt", l));
    if (trustVisible && !state.trustPromptEmitted) {
      return {
        events: [{ type: "trust_prompt" }],
        stateUpdate: { trustPromptEmitted: true }
      };
    }
    if (!trustVisible && state.trustPromptEmitted) {
      return { events: [], stateUpdate: { trustPromptEmitted: false } };
    }
    return { events: [], stateUpdate: {} };
  }
};
var ONBOARDING_EXTRACTOR = {
  name: "onboarding",
  purpose: "Emit internal drive events when claude is sitting on a first-run onboarding screen. The Conversation accepts the highlighted default and keeps waiting for the ready footer.",
  apply({ lines }) {
    if (lines.some((l) => matches("onboardingEffort", l))) {
      return { events: [{ type: "onboarding_effort" }], stateUpdate: {} };
    }
    if (lines.some((l) => matches("onboardingTheme", l))) {
      return { events: [{ type: "onboarding_theme" }], stateUpdate: {} };
    }
    if (lines.some((l) => matches("onboardingSplash", l))) {
      return { events: [{ type: "onboarding_splash" }], stateUpdate: {} };
    }
    return { events: [], stateUpdate: {} };
  }
};
var TOOL_USE_EXTRACTOR = {
  name: "tool-use",
  purpose: "Walk every line; emit a `tool_use` per unique `\u23FA Name(args)` shape. Dedup by line position + content.",
  apply({ lines, state, anchor }) {
    const events = [];
    const next = new Set(state.announcedTools);
    for (let i = anchor; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      const m = MARKERS.toolCall.pattern.exec(line);
      if (!m) continue;
      const sig = `${i}::${line}`;
      if (next.has(sig)) continue;
      next.add(sig);
      const groups = m.groups ?? {};
      const name = groups.mcpName ?? groups.legacyName ?? m[1] ?? "";
      const summary = groups.mcpArgs ?? groups.legacyArgs ?? m[2];
      events.push(
        summary && summary.length > 0 ? { type: "tool_use", name, summary } : { type: "tool_use", name }
      );
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { announcedTools: next, turnHadActivity: true } };
  }
};
var USAGE_LINE_EXTRACTOR = {
  name: "usage",
  purpose: "Walk every line; emit `usage` once per unique (input,output) pair.",
  apply({ lines, state }) {
    const events = [];
    const next = new Set(state.emittedUsage);
    for (const line of lines) {
      const m = MARKERS.usageLine.pattern.exec(line);
      if (!m) continue;
      const sig = `${m[1]}/${m[2]}`;
      if (next.has(sig)) continue;
      next.add(sig);
      events.push({
        type: "usage",
        inputTokens: Number(m[1] ?? "0"),
        outputTokens: Number(m[2] ?? "0")
      });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedUsage: next } };
  }
};
var OAUTH_URL_EXTRACTOR = {
  name: "oauth-url",
  purpose: "Emit `auth_required` when an OAuth URL appears in any line.",
  apply({ lines, state }) {
    const events = [];
    const next = new Set(state.emittedAuthUrl);
    for (const line of lines) {
      const m = MARKERS.oauthUrl.pattern.exec(line);
      if (!m?.[1]) continue;
      if (next.has(m[1])) continue;
      next.add(m[1]);
      events.push({ type: "auth_required", url: m[1] });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedAuthUrl: next } };
  }
};
var PERMISSION_DIALOG_EXTRACTOR = {
  name: "permission-dialog",
  purpose: "Emit `permission_prompt` for STRICT-shape permission dialogs only. Tip lines containing `Run` / `?` do NOT match.",
  apply({ lines, state }) {
    const events = [];
    const next = new Set(state.emittedPermission);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!matches("permissionDialog", trimmed)) continue;
      if (next.has(trimmed)) continue;
      next.add(trimmed);
      events.push({ type: "permission_prompt", question: trimmed });
    }
    if (events.length === 0) return { events: [], stateUpdate: {} };
    return { events, stateUpdate: { emittedPermission: next } };
  }
};
var BLOCK_EXTRACTORS = Object.freeze([
  ASSISTANT_TEXT_EXTRACTOR,
  REASONING_EXTRACTOR
]);
var LINE_EXTRACTORS = Object.freeze([
  TRUST_PROMPT_EXTRACTOR,
  ONBOARDING_EXTRACTOR,
  API_ERROR_EXTRACTOR,
  TOOL_USE_EXTRACTOR,
  TOOL_RESULT_EXTRACTOR,
  USAGE_LINE_EXTRACTOR,
  OAUTH_URL_EXTRACTOR,
  PERMISSION_DIALOG_EXTRACTOR,
  // Ready/turn_complete must run LAST so all activity-setting extractors
  // upstream have already updated state for the same snapshot.
  READY_LINE_EXTRACTOR
]);

// src/pty/tui/types.ts
function initialParserState() {
  return {
    emittedAssistantText: "",
    emittedReasoning: "",
    announcedTools: /* @__PURE__ */ new Set(),
    emittedUsage: /* @__PURE__ */ new Set(),
    emittedPermission: /* @__PURE__ */ new Set(),
    emittedAuthUrl: /* @__PURE__ */ new Set(),
    readyEmitted: false,
    trustPromptEmitted: false,
    inTurn: false,
    turnHadActivity: false,
    currentTurnAnchorLine: "",
    previousTurnFinalText: "",
    lastFooter: "unknown",
    sawBusyInTurn: false,
    announcedToolResults: /* @__PURE__ */ new Set(),
    emittedErrors: /* @__PURE__ */ new Set()
  };
}

// src/pty/tui/engine.ts
var TuiEngine = class {
  state = initialParserState();
  reset() {
    this.state = initialParserState();
  }
  /** Reset per-turn state. Keeps cross-turn dedup sets and the previous
   *  turn's final text (so the assistant extractor can subtract it if
   *  claude renders a concatenated buffer line). */
  markTurnStarted() {
    this.state.previousTurnFinalText = this.state.emittedAssistantText;
    this.state.emittedAssistantText = "";
    this.state.emittedReasoning = "";
    this.state.announcedTools = /* @__PURE__ */ new Set();
    this.state.announcedToolResults = /* @__PURE__ */ new Set();
    this.state.emittedPermission = /* @__PURE__ */ new Set();
    this.state.turnHadActivity = false;
    this.state.inTurn = true;
    this.state.lastFooter = "unknown";
    this.state.sawBusyInTurn = false;
  }
  /** Inspect the live state (for tests and debug). Returns a shallow
   *  copy; the engine's own state is untouched. */
  snapshotState() {
    return {
      ...this.state,
      announcedTools: new Set(this.state.announcedTools),
      emittedUsage: new Set(this.state.emittedUsage),
      emittedPermission: new Set(this.state.emittedPermission),
      emittedAuthUrl: new Set(this.state.emittedAuthUrl)
    };
  }
  parse(snap) {
    const lines = stripAnsiLines(snap.lines);
    const anchor = computeAnchor(lines);
    const out = [];
    for (const ex of BLOCK_EXTRACTORS) {
      const { events, stateUpdate } = this.runBlockExtractor(ex, lines, anchor, snap.cursorY);
      if (events.length > 0) out.push(...events);
      this.applyStateUpdate(stateUpdate);
    }
    for (const ex of LINE_EXTRACTORS) {
      const { events, stateUpdate } = ex.apply({ lines, state: this.state, anchor });
      if (events.length > 0) out.push(...events);
      this.applyStateUpdate(stateUpdate);
    }
    if (out.some((e) => e.type === "turn_complete")) {
      this.state.previousTurnFinalText = this.state.emittedAssistantText;
      this.state.inTurn = false;
      this.state.turnHadActivity = false;
      this.state.lastFooter = "ready";
    }
    return out;
  }
  runBlockExtractor(ex, lines, anchor, cursorY) {
    const searchFrom = ex.ignoreAnchor === true ? 0 : anchor;
    const startIdx = ex.findLast === true ? this.findLastMatching(lines, ex, searchFrom) : this.findFirstMatching(lines, ex, searchFrom);
    if (startIdx < 0) return { events: [], stateUpdate: {} };
    const stopSet = ex.stops;
    const skipSet = ex.skips;
    const collected = [];
    const startLine = lines[startIdx] ?? "";
    const stripped = stripStarterMarker(startLine, ex.start);
    collected.push(stripped);
    const upperBound = Math.min(lines.length, Math.max(cursorY + 1, startIdx + 1) + 200);
    for (let i = startIdx + 1; i < upperBound; i += 1) {
      const line = lines[i] ?? "";
      const trimmed = line.trim();
      if (trimmed.length > 0 && stopSet.some((m) => matches(m, trimmed))) break;
      if (skipSet.some((m) => matches(m, line))) continue;
      collected.push(line);
    }
    let processed = collected;
    for (const t of ex.transforms) processed = t(processed);
    const text = processed.join("\n").trim();
    return ex.emit({ text, lines: processed, state: this.state });
  }
  findFirstMatching(lines, ex, from) {
    for (let i = Math.max(0, from); i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (!matches(ex.start, line)) continue;
      if (ex.excludeStart && matches(ex.excludeStart, line)) continue;
      return i;
    }
    return -1;
  }
  findLastMatching(lines, ex, from) {
    for (let i = lines.length - 1; i >= Math.max(0, from); i -= 1) {
      const line = lines[i] ?? "";
      if (!matches(ex.start, line)) continue;
      if (ex.excludeStart && matches(ex.excludeStart, line)) continue;
      return i;
    }
    return -1;
  }
  applyStateUpdate(update) {
    for (const [k, v] of Object.entries(update)) {
      this.state[k] = v;
    }
  }
};
function stripStarterMarker(line, marker) {
  if (marker === "assistantStart") return line.replace(/^\s*[⏺●]\s*/u, "");
  if (marker === "reasoningStart") {
    return "";
  }
  return line;
}

// src/pty/tui-parser.ts
var LEGACY_MAP = {
  readyMarker: "readyFooter",
  assistantBlockStart: "assistantStart",
  reasoningBlockStart: "reasoningStart",
  // `blockEnd` is no longer used by the engine (each extractor owns its
  // own stop set). Kept here as a union of the legacy patterns so tests
  // that ask `DEFAULT_PATTERNS.blockEnd.test(...)` still get a sensible
  // answer.
  blockEnd: "divider",
  toolCallLine: "toolCall",
  usageLine: "usageLine",
  permissionPrompt: "permissionDialog",
  oauthUrl: "oauthUrl",
  trustPrompt: "trustPrompt",
  busyFooter: "busyFooter"
};
var DEFAULT_PATTERNS = Object.freeze({
  readyMarker: MARKERS[LEGACY_MAP.readyMarker].pattern,
  assistantBlockStart: MARKERS[LEGACY_MAP.assistantBlockStart].pattern,
  reasoningBlockStart: MARKERS[LEGACY_MAP.reasoningBlockStart].pattern,
  blockEnd: MARKERS[LEGACY_MAP.blockEnd].pattern,
  toolCallLine: MARKERS[LEGACY_MAP.toolCallLine].pattern,
  usageLine: MARKERS[LEGACY_MAP.usageLine].pattern,
  permissionPrompt: MARKERS[LEGACY_MAP.permissionPrompt].pattern,
  oauthUrl: MARKERS[LEGACY_MAP.oauthUrl].pattern,
  trustPrompt: MARKERS[LEGACY_MAP.trustPrompt].pattern,
  busyFooter: MARKERS[LEGACY_MAP.busyFooter].pattern
});
var TuiParser = class {
  engine;
  constructor(_patterns = DEFAULT_PATTERNS) {
    this.engine = new TuiEngine();
  }
  reset() {
    this.engine.reset();
  }
  markTurnStarted() {
    this.engine.markTurnStarted();
  }
  /** Back-compat alias. */
  resetTurn() {
    this.engine.markTurnStarted();
  }
  parse(snap) {
    return this.engine.parse(snap);
  }
};

// src/conversation/factory.ts
function assembleConversation(deps) {
  const pty = ClaudePty.start(
    {
      command: deps.claudePath,
      args: [...deps.args],
      cwd: deps.cwd,
      env: deps.env,
      cols: deps.cols,
      rows: deps.rows
    },
    deps.spawner ?? new NodePtySpawner()
  );
  const terminal = new TerminalAdapter({ cols: deps.cols, rows: deps.rows });
  const parser = new TuiParser();
  const driver = new InputDriver({ write: (d) => {
    pty.write(d);
  } });
  return new Conversation({
    id: deps.id,
    cwd: deps.cwd,
    pty,
    terminal,
    parser,
    driver,
    idleQuietMs: deps.idleQuietMs
  });
}
var ProductionConversationFactory = class {
  constructor(deps) {
    this.deps = deps;
  }
  deps;
  create(opts) {
    const args = [];
    if (opts.model) args.push("--model", opts.model);
    if (opts.effort) args.push("--effort", opts.effort);
    if (opts.systemPromptAppend) args.push("--append-system-prompt", opts.systemPromptAppend);
    if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
    args.push("--add-dir", opts.cwd);
    if (this.deps.uploadsRoot) {
      const uploadsDir = join(this.deps.uploadsRoot, opts.id);
      args.push("--add-dir", uploadsDir);
    }
    args.push("--permission-mode", "bypassPermissions");
    const conv = assembleConversation({
      id: opts.id,
      claudePath: this.deps.claudePath,
      args,
      cwd: opts.cwd,
      env: this.deps.env,
      cols: this.deps.cols,
      rows: this.deps.rows,
      idleQuietMs: this.deps.idleQuietMs,
      ...this.deps.spawner ? { spawner: this.deps.spawner } : {}
    });
    return Promise.resolve(conv);
  }
};
var ConversationManager = class {
  constructor(opts) {
    this.opts = opts;
  }
  opts;
  conversations = /* @__PURE__ */ new Map();
  list() {
    return Array.from(this.conversations.values());
  }
  get(id) {
    return this.conversations.get(id);
  }
  size() {
    return this.conversations.size;
  }
  async create(opts) {
    if (this.conversations.size >= this.opts.maxConversations) {
      throw new June1815Error(
        "conversation_limit_reached",
        `max ${this.opts.maxConversations} conversations active`
      );
    }
    const id = opts.id ?? randomUUID();
    if (this.conversations.has(id)) {
      throw new June1815Error("conversation_busy", `conversation ${id} already exists`);
    }
    const resumeSessionId = this.opts.markers.read(id) ?? void 0;
    const factoryArgs = {
      id,
      cwd: opts.cwd
    };
    if (opts.model !== void 0) factoryArgs.model = opts.model;
    if (opts.effort !== void 0) factoryArgs.effort = opts.effort;
    if (opts.systemPromptAppend !== void 0)
      factoryArgs.systemPromptAppend = opts.systemPromptAppend;
    if (resumeSessionId !== void 0) factoryArgs.resumeSessionId = resumeSessionId;
    const conv = await this.opts.factory.create(factoryArgs);
    this.conversations.set(id, conv);
    return conv;
  }
  async delete(id) {
    const conv = this.conversations.get(id);
    if (!conv) {
      throw new June1815Error("conversation_not_found", `no conversation ${id}`);
    }
    this.conversations.delete(id);
    conv.kill();
    await Promise.resolve();
  }
  /** Best-effort shutdown of every conversation. Used at server stop. */
  async destroyAll() {
    const ids = Array.from(this.conversations.keys());
    await Promise.all(ids.map((id) => this.delete(id).catch(() => void 0)));
  }
};
var realFs4 = {
  existsSync: existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
  writeFileSync: (p, d) => {
    writeFileSync(p, d);
  },
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  },
  rmSync: (p, o) => {
    rmSync(p, o);
  }
};
var MARKER_FILE = "session.txt";
var SessionMarkerStore = class {
  constructor(dataDir, fs = realFs4) {
    this.dataDir = dataDir;
    this.fs = fs;
  }
  dataDir;
  fs;
  dirFor(conversationId) {
    return join(this.dataDir, "conversations", conversationId);
  }
  pathFor(conversationId) {
    return join(this.dirFor(conversationId), MARKER_FILE);
  }
  read(conversationId) {
    const p = this.pathFor(conversationId);
    if (!this.fs.existsSync(p)) return null;
    try {
      const v = this.fs.readFileSync(p, "utf8").trim();
      return v.length > 0 ? v : null;
    } catch {
      return null;
    }
  }
  write(conversationId, sessionId) {
    const dir = this.dirFor(conversationId);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    this.fs.writeFileSync(this.pathFor(conversationId), sessionId.trim());
  }
  delete(conversationId) {
    const p = this.pathFor(conversationId);
    if (!this.fs.existsSync(p)) return;
    this.fs.rmSync(p, { force: true });
  }
};
var realFs5 = {
  existsSync: existsSync,
  readFileSync: (p, e) => readFileSync(p, e)
};
var ENV_PRIORITY = Object.freeze([
  { key: "CLAUDE_CODE_OAUTH_TOKEN", source: "env_oauth" },
  { key: "ANTHROPIC_API_KEY", source: "env_anthropic_key" },
  { key: "CLAUDE_API_KEY", source: "env_claude_key" }
]);
var JUNE1815_TOKEN_FILE = "agent_token.txt";
var CLAUDE_CREDENTIALS_REL = [".claude", ".credentials.json"];
function detectAuth(input = {}) {
  const env = input.env ?? process.env;
  const home = input.homeDir ?? homedir();
  const dataDir = input.dataDir ?? join(home, ".local", "share", "june1815");
  const fs = input.fs ?? realFs5;
  for (const c of ENV_PRIORITY) {
    const v = env[c.key];
    if (v && v.trim().length > 0) {
      return { authenticated: true, source: c.source, envKey: c.key };
    }
  }
  const tokenPath = join(dataDir, JUNE1815_TOKEN_FILE);
  if (fs.existsSync(tokenPath)) {
    try {
      if (fs.readFileSync(tokenPath, "utf8").trim().length > 0) {
        return { authenticated: true, source: "june1815_token_file", path: tokenPath };
      }
    } catch {
    }
  }
  const claudeCredsPath = join(home, ...CLAUDE_CREDENTIALS_REL);
  if (fs.existsSync(claudeCredsPath)) {
    return { authenticated: true, source: "claude_credentials", path: claudeCredsPath };
  }
  return { authenticated: false, source: "none" };
}
var ANSI_RE2 = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*\x07|[78=>]|\([AB012])/g;
var realProbeSpawn = {
  run: (cmd, args, timeoutMs) => new Promise((resolve2) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve2({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve2({ code: -1, stdout, stderr: err.message });
    });
  })
};
function parseClaudeAuthStatus(stdout) {
  const cleaned = stdout.replace(ANSI_RE2, "").replace(/\r/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) return { loggedIn: false };
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const loggedIn = parsed.loggedIn === true;
    const out = { loggedIn };
    if (typeof parsed.authMethod === "string") out.authMethod = parsed.authMethod;
    if (typeof parsed.email === "string") out.email = parsed.email;
    if (typeof parsed.orgName === "string") out.orgName = parsed.orgName;
    if (typeof parsed.subscriptionType === "string")
      out.subscriptionType = parsed.subscriptionType;
    return out;
  } catch {
    return { loggedIn: false };
  }
}
async function probeClaudeAuthStatus(claudePath, spawnFacade = realProbeSpawn, timeoutMs = 5e3) {
  const r = await spawnFacade.run(claudePath, ["auth", "status"], timeoutMs);
  if (r.code !== 0) return { loggedIn: false };
  return parseClaudeAuthStatus(r.stdout);
}

// src/server/auth-service.ts
var realFs6 = {
  existsSync: existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
  writeFileSync: (p, d, o) => {
    writeFileSync(p, d, o);
  },
  rmSync: (p, o) => {
    rmSync(p, o);
  },
  mkdirSync: (p, o) => {
    mkdirSync(p, o);
  }
};
var TOKEN_FILE = "agent_token.txt";
var AuthService = class _AuthService {
  dataDir;
  homeDir;
  env;
  fs;
  claudePath;
  probeSpawn;
  // Cache the probe result for a short window so the auth-status route
  // doesn't spawn claude on every poll.
  probeCache = null;
  static PROBE_TTL_MS = 5e3;
  constructor(opts) {
    this.dataDir = opts.dataDir;
    this.homeDir = opts.homeDir ?? homedir();
    this.env = opts.env ?? process.env;
    this.fs = opts.fs ?? realFs6;
    this.claudePath = opts.claudePath;
    this.probeSpawn = opts.probeSpawn;
  }
  tokenPath() {
    return join(this.dataDir, TOKEN_FILE);
  }
  /** Synchronous status — checks local sources only. Returns `none`
   *  when claude's OAuth credentials live somewhere `detectAuth` can't
   *  see (e.g. macOS Keychain). Prefer `status()` for the full answer. */
  statusLocal() {
    return detectAuth({
      env: this.env,
      homeDir: this.homeDir,
      dataDir: this.dataDir,
      fs: this.fs
    });
  }
  /**
   * Full status: local sources first; if none found, probe
   * `claude auth status` (cached briefly) so OS-keychain credentials are
   * detected too.
   */
  async status() {
    const local = this.statusLocal();
    if (local.authenticated) return local;
    if (!this.claudePath) return local;
    const now = Date.now();
    if (this.probeCache && now - this.probeCache.at < _AuthService.PROBE_TTL_MS) {
      return this.probeCache.info;
    }
    let info = local;
    try {
      const probe = this.probeSpawn ? await probeClaudeAuthStatus(this.claudePath, this.probeSpawn) : await probeClaudeAuthStatus(this.claudePath);
      if (probe.loggedIn) {
        const identity = {};
        if (probe.authMethod !== void 0) identity.authMethod = probe.authMethod;
        if (probe.email !== void 0) identity.email = probe.email;
        if (probe.orgName !== void 0) identity.orgName = probe.orgName;
        if (probe.subscriptionType !== void 0)
          identity.subscriptionType = probe.subscriptionType;
        const next = { authenticated: true, source: "claude_cli_session" };
        if (Object.keys(identity).length > 0) next.identity = identity;
        info = next;
      }
    } catch {
    }
    this.probeCache = { at: now, info };
    return info;
  }
  setToken(token) {
    if (!this.fs.existsSync(this.dataDir)) {
      this.fs.mkdirSync(this.dataDir, { recursive: true, mode: 448 });
    }
    this.fs.writeFileSync(this.tokenPath(), token.trim(), { mode: 384 });
    this.probeCache = null;
  }
  clear() {
    const p = this.tokenPath();
    if (this.fs.existsSync(p)) this.fs.rmSync(p, { force: true });
    this.probeCache = null;
  }
};

// src/server/middleware/bearer-auth.ts
function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function parseCookie(header, name) {
  if (!header) return null;
  const pairs = header.split(";");
  for (const raw of pairs) {
    const idx = raw.indexOf("=");
    if (idx < 0) continue;
    const k = raw.slice(0, idx).trim();
    if (k !== name) continue;
    const v = raw.slice(idx + 1).trim();
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}
function bearerAuthMiddleware(opts) {
  const publicPaths = opts.publicPaths ?? [];
  const cookieName = opts.cookieName ?? "june1815_token";
  const cookieMaxAge = opts.cookieMaxAgeSec ?? 12 * 60 * 60;
  const secureFlag = opts.cookieInsecure === true ? "" : "; Secure";
  return async (c, next) => {
    const path = c.req.path;
    if (publicPaths.some((p) => path === p || path.startsWith(`${p}/`))) {
      return next();
    }
    const header = c.req.header("authorization") ?? "";
    const headerMatch = /^Bearer\s+(.+)$/i.exec(header);
    let token = null;
    let source = null;
    if (headerMatch?.[1]) {
      token = headerMatch[1];
      source = "header";
    } else {
      const qToken = c.req.query("token");
      if (qToken && qToken.length > 0) {
        token = qToken;
        source = "query";
      } else {
        const cookieToken = parseCookie(c.req.header("cookie"), cookieName);
        if (cookieToken) {
          token = cookieToken;
          source = "cookie";
        }
      }
    }
    if (!token || !constantTimeEqual(token, opts.token)) {
      return c.json(
        { code: "http_unauthorized", message: "missing or invalid bearer token" },
        401
      );
    }
    await next();
    if ((source === "header" || source === "query") && c.req.method === "GET") {
      const cookieValue = encodeURIComponent(opts.token);
      c.header(
        "Set-Cookie",
        `${cookieName}=${cookieValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${cookieMaxAge}${secureFlag}`,
        { append: true }
      );
    }
  };
}

// src/server/middleware/error.ts
var STATUS_FOR_CODE = {
  config_invalid: 400,
  config_yaml_parse: 400,
  config_yaml_read: 500,
  claude_not_found: 503,
  claude_install_declined: 503,
  claude_install_failed: 503,
  auth_unavailable: 401,
  pty_spawn_failed: 500,
  pty_dead: 410,
  conversation_not_found: 404,
  conversation_busy: 409,
  conversation_limit_reached: 429,
  http_bad_request: 400,
  http_unauthorized: 401,
  // These codes only fire from CLI modes (the stream-json shim, tool-defs
  // loader) or the conversation startup path. They never reach the HTTP
  // error handler, but they're listed here to keep the union exhaustive.
  shim_no_claude_path: 503,
  shim_bad_input: 400,
  tool_defs_invalid: 400,
  claude_onboarding_required: 503
};
function errorHandler(log) {
  return (err, c) => {
    if (isJune1815Error(err)) {
      const status = STATUS_FOR_CODE[err.code];
      return c.json(
        { code: err.code, message: err.message, details: err.details },
        status
      );
    }
    log?.error(err, "unhandled error");
    return c.json(
      { code: "internal_error", message: "internal server error" },
      500
    );
  };
}
var HEADER = "x-request-id";
function requestIdMiddleware() {
  return async (c, next) => {
    const incoming = c.req.header(HEADER);
    const requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header(HEADER, requestId);
  };
}

// src/server/server.ts
var DEFAULT_PUBLIC_PATHS = Object.freeze(["/healthz"]);
function createServer(deps) {
  const app = new Hono();
  app.use("*", requestIdMiddleware());
  app.use(
    "*",
    bearerAuthMiddleware({
      token: deps.bearerToken,
      publicPaths: deps.publicPaths ?? DEFAULT_PUBLIC_PATHS,
      cookieInsecure: deps.cookieInsecure ?? true
    })
  );
  app.onError(errorHandler(deps.log));
  return { app, bearerToken: deps.bearerToken };
}
var TokenBodySchema = z.object({
  token: z.string().min(16).max(4096)
});
function registerAuthRoutes(app, deps) {
  app.get("/v1/auth/status", async (c) => {
    const info = await deps.auth.status();
    const base = {
      authenticated: info.authenticated,
      source: info.source
    };
    if (info.envKey !== void 0) base.envKey = info.envKey;
    if (info.path !== void 0) base.path = info.path;
    if (info.identity !== void 0) base.identity = info.identity;
    return c.json(base);
  });
  app.post("/v1/auth/token", async (c) => {
    const body = await c.req.json().catch(() => {
      throw new June1815Error("http_bad_request", "invalid JSON body");
    });
    const parsed = TokenBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new June1815Error("http_bad_request", "token must be 16..4096 chars");
    }
    deps.auth.setToken(parsed.data.token);
    return c.json({ stored: true });
  });
  app.delete("/v1/auth", (c) => {
    deps.auth.clear();
    return c.body(null, 204);
  });
}
var CreateBodySchema = z.object({
  id: z.string().min(1).max(128).optional(),
  cwd: z.string().min(1),
  model: z.string().min(1).optional(),
  effort: z.string().min(1).optional(),
  systemPromptAppend: z.string().optional()
});
function summarize(c) {
  return { id: c.id, cwd: c.cwd, state: c.state, pendingCount: c.pendingCount };
}
function registerConversationRoutes(app, deps) {
  app.get("/v1/conversations", (c) => {
    const list = deps.conversations.list().map(
      (conv) => summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount
      })
    );
    return c.json({ conversations: list });
  });
  app.post("/v1/conversations", async (c) => {
    const body = await c.req.json().catch(() => {
      throw new June1815Error("http_bad_request", "invalid JSON body");
    });
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new June1815Error("http_bad_request", parsed.error.issues.map((i) => i.message).join("; "));
    }
    const args = { cwd: parsed.data.cwd };
    if (parsed.data.id !== void 0) args.id = parsed.data.id;
    if (parsed.data.model !== void 0) args.model = parsed.data.model;
    if (parsed.data.effort !== void 0) args.effort = parsed.data.effort;
    if (parsed.data.systemPromptAppend !== void 0) args.systemPromptAppend = parsed.data.systemPromptAppend;
    const conv = await deps.conversations.create(args);
    return c.json(
      summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount
      }),
      201
    );
  });
  app.get("/v1/conversations/:id", (c) => {
    const conv = deps.conversations.get(c.req.param("id"));
    if (!conv) throw new June1815Error("conversation_not_found", c.req.param("id"));
    return c.json(
      summarize({
        id: conv.id,
        cwd: conv.cwd,
        state: conv.state,
        pendingCount: conv.pendingCount
      })
    );
  });
  app.delete("/v1/conversations/:id", async (c) => {
    await deps.conversations.delete(c.req.param("id"));
    return c.body(null, 204);
  });
}

// src/server/routes/health.ts
function registerHealthRoute(app, info) {
  app.get("/healthz", (c) => {
    return c.json({
      status: "ok",
      version: info.version,
      startedAt: info.startedAt,
      uptimeMs: Math.max(0, Date.now() - new Date(info.startedAt).getTime())
    });
  });
}
var AttachmentSchema = z.object({
  kind: z.enum(["image", "file"]),
  dataUrl: z.string().min(8).max(20 * 1024 * 1024),
  contentType: z.string().min(1).max(256).optional(),
  name: z.string().min(1).max(256).optional()
});
var SendBodySchema = z.object({
  text: z.string().min(1),
  attachments: z.array(AttachmentSchema).max(16).optional()
});
var SteerBodySchema = z.object({
  text: z.string().min(1)
});
function toAttachmentInput(a) {
  const out = { kind: a.kind, dataUrl: a.dataUrl };
  if (a.contentType !== void 0) out.contentType = a.contentType;
  if (a.name !== void 0) out.name = a.name;
  return out;
}
function saveAttachments(store, attachments) {
  const messageId = randomUUID();
  const saved = attachments.map((a, i) => {
    try {
      return store.save(messageId, toAttachmentInput(a), i);
    } catch (err) {
      throw new June1815Error(
        "http_bad_request",
        `attachment[${i}]: ${err.message}`
      );
    }
  });
  return { messageId, saved };
}
function bridge(e, messageId) {
  switch (e.type) {
    case "text_delta":
      return { type: "text_delta", text: e.text };
    case "reasoning_delta":
      return { type: "reasoning_delta", text: e.text };
    case "tool_use":
      return e.summary !== void 0 ? { type: "tool_use", name: e.name, summary: e.summary } : { type: "tool_use", name: e.name };
    case "tool_result":
      return { type: "tool_use", name: e.name, summary: e.summary };
    case "error":
      return { type: "error", code: e.code, message: e.message };
    case "usage":
      return { type: "usage", inputTokens: e.inputTokens, outputTokens: e.outputTokens };
    case "permission_prompt":
      return { type: "permission_prompt", question: e.question };
    case "auth_required":
      return { type: "auth_required", url: e.url, method: "oauth" };
    case "message_completed":
      return e.messageId === messageId ? { type: "done", messageId } : null;
    case "pty_exited":
      return {
        type: "error",
        code: "pty_dead",
        message: `pty exited (code ${e.exitCode}${e.signal !== null ? `, signal ${e.signal}` : ""})`
      };
    default:
      return null;
  }
}
function registerMessageRoutes(app, deps) {
  const dispatchSend = async (c, intent) => {
    const id = c.req.param("id") ?? "";
    if (id.length === 0) throw new June1815Error("http_bad_request", "missing conversation id");
    const conv = deps.conversations.get(id);
    if (!conv) throw new June1815Error("conversation_not_found", id);
    const body = await c.req.json().catch(() => {
      throw new June1815Error("http_bad_request", "invalid JSON body");
    });
    const parsed = SendBodySchema.safeParse(body);
    if (!parsed.success) throw new June1815Error("http_bad_request", "text required");
    const attachments = parsed.data.attachments ?? [];
    let messageId;
    if (attachments.length > 0) {
      const store = deps.uploadStoreFor?.(id);
      if (!store) {
        throw new June1815Error(
          "http_bad_request",
          "attachments not supported on this server (uploadStoreFor not configured)"
        );
      }
      const { saved } = saveAttachments(store, attachments);
      messageId = conv.sendWithAttachments({ text: parsed.data.text, attachments: saved });
    } else {
      messageId = conv.send(parsed.data.text);
    }
    if (intent === "queue") {
      return c.json({ messageId, queued: true });
    }
    return streamSSE(c, async (stream) => {
      await streamConversationUntilDone(stream, conv, messageId);
    });
  };
  app.post("/v1/conversations/:id/messages", (c) => dispatchSend(c, "stream"));
  app.post("/v1/conversations/:id/queue", (c) => dispatchSend(c, "queue"));
  app.post("/v1/conversations/:id/interrupt", async (c) => {
    const id = c.req.param("id");
    const conv = deps.conversations.get(id);
    if (!conv) throw new June1815Error("conversation_not_found", id);
    await c.req.json().catch(() => void 0);
    conv.interrupt();
    return c.json({ interrupted: true });
  });
  app.post("/v1/conversations/:id/steer", async (c) => {
    const id = c.req.param("id");
    const conv = deps.conversations.get(id);
    if (!conv) throw new June1815Error("conversation_not_found", id);
    const body = await c.req.json().catch(() => {
      throw new June1815Error("http_bad_request", "invalid JSON body");
    });
    const parsed = SteerBodySchema.safeParse(body);
    if (!parsed.success) throw new June1815Error("http_bad_request", "text required");
    const messageId = conv.steer(parsed.data.text);
    return c.json({ messageId, steered: true });
  });
}
async function streamConversationUntilDone(stream, conv, messageId) {
  const queued = [];
  let resolveWaiter = null;
  const wake = () => {
    if (resolveWaiter) {
      const r = resolveWaiter;
      resolveWaiter = null;
      r();
    }
  };
  const unsubscribe = conv.onEvent((e) => {
    queued.push(e);
    wake();
  });
  try {
    for (; ; ) {
      if (queued.length === 0) {
        await new Promise((resolve2) => {
          resolveWaiter = resolve2;
        });
      }
      const next = queued.shift();
      if (!next) continue;
      const sse = bridge(next, messageId);
      if (!sse) continue;
      await stream.writeSSE({ event: sse.type, data: JSON.stringify(sse) });
      if (sse.type === "done" || sse.type === "error") {
        await stream.close();
        return;
      }
    }
  } finally {
    unsubscribe();
  }
}
var realFs7 = {
  existsSync: existsSync,
  readFileSync: (p) => readFileSync(p),
  isFile: (p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  }
};
var CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8"
};
function contentTypeFor(filePath) {
  return CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
}
function resolveSafe(distDir, requestPath) {
  const absRoot = resolve(distDir);
  const rel = requestPath.replace(/^\/+/, "");
  const candidate = normalize(join(absRoot, rel));
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : `${absRoot}${sep}`;
  if (candidate !== absRoot && !candidate.startsWith(rootWithSep)) return null;
  return candidate;
}
function registerUiRoutes(app, deps) {
  const fs = deps.fs ?? realFs7;
  const distDir = resolve(deps.distDir);
  const indexPath = join(distDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    app.get(
      "/",
      (c) => c.text(
        `june1815 UI is enabled but index.html was not found under ${distDir}.
Run \`npm run build:ui\` (or set ui.distDir to your built directory).
`,
        503
      )
    );
    return;
  }
  app.get("*", (c) => {
    const reqPath = new URL(c.req.url).pathname;
    const resolved = resolveSafe(distDir, reqPath);
    if (resolved && resolved !== distDir && fs.isFile(resolved)) {
      const body = fs.readFileSync(resolved);
      return c.body(body, 200, {
        "Content-Type": contentTypeFor(resolved),
        "Cache-Control": "no-cache"
      });
    }
    const index = fs.readFileSync(indexPath);
    return c.body(index, 200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    });
  });
}
var clackConfirmPrompt = {
  async confirm(message) {
    const result = await clack.confirm({ message, initialValue: true });
    if (clack.isCancel(result)) return false;
    return result;
  }
};
function intro2(text) {
  clack.intro(text);
}
function outro2(text) {
  clack.outro(text);
}
function note2(text, title) {
  clack.note(text, title);
}

// src/cli/commands/gogogo.ts
function defaultDataDir(home) {
  return join(home, ".local", "share", "june1815");
}
function effectiveMode(config, isTty) {
  return config.mode ?? (isTty ? "interactive" : "headless");
}
function buildBearerToken(config) {
  return config.server.auth.bearerToken ?? randomBytes(24).toString("hex");
}
async function composeGogogo(opts) {
  const config = loadConfig({
    cliOverrides: opts.cliPartial,
    env: opts.env,
    homeDir: opts.home
  });
  const mode = effectiveMode(config, opts.isTty);
  const log = opts.log ?? createLogger(loggerOptionsFromConfig(config, opts.isTty));
  const pathVar = opts.env.PATH;
  const locatorInput = {
    pathVar,
    home: opts.home
  };
  if (config.claude.path) locatorInput.overridePath = config.claude.path;
  let resolved = locateClaude(locatorInput);
  if (!resolved.found) {
    log.warn("claude not found on PATH; attempting install per config");
    const installInput = {
      mode,
      autoInstall: config.claude.autoInstall,
      log: { info: (m) => {
        log.info(m);
      }, warn: (m) => {
        log.warn(m);
      } }
    };
    if (mode === "interactive") installInput.prompt = clackConfirmPrompt;
    await installOrThrow(installInput);
    resolved = locateClaude(locatorInput);
    if (!resolved.found) {
      throw new June1815Error(
        "claude_not_found",
        "install reported success but claude still not on PATH"
      );
    }
  }
  const dataDir = config.dataDir ?? defaultDataDir(opts.home);
  const auth = new AuthService({
    dataDir,
    homeDir: opts.home,
    env: opts.env,
    claudePath: resolved.path
  });
  const authInfo = await auth.status();
  if (!authInfo.authenticated) {
    log.warn(
      "no claude authentication detected (env vars, token file, ~/.claude/.credentials.json, or `claude auth status`). New conversations will fail until you authenticate."
    );
  } else {
    log.info({ source: authInfo.source }, "auth source resolved");
  }
  const childEnv = {
    ...opts.env,
    PATH: enrichedPath({ pathVar, home: opts.home })
  };
  const uploadsRoot = join(dataDir, "uploads");
  const factory = new ProductionConversationFactory({
    claudePath: resolved.path,
    env: childEnv,
    cols: config.pty.cols,
    rows: config.pty.rows,
    idleQuietMs: config.pty.idleQuietMs,
    uploadsRoot
  });
  const markers = new SessionMarkerStore(dataDir);
  const conversations = new ConversationManager({
    factory,
    markers,
    maxConversations: config.limits.maxConversations
  });
  const uploadStoreFor = (conversationId) => new UploadStore(join(uploadsRoot, conversationId));
  return {
    config,
    mode,
    log,
    conversations,
    auth,
    bearerToken: buildBearerToken(config),
    factory,
    claudePath: resolved.path,
    uploadStoreFor
  };
}
function resolveUiDistDir(config) {
  if (config.ui.distDir) return config.ui.distDir;
  const here = dirname$1(fileURLToPath$1(import.meta.url));
  const candidates = [
    join(here, "..", "ui"),
    // dist/cli → dist/ui (bundled CLI entry)
    join(here, "ui"),
    // dist → dist/ui (library entry)
    join(here, "..", "dist", "ui")
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "index.html"))) return c;
  }
  return candidates[0] ?? join(here, "..", "ui");
}
function buildServerApp(composition, version) {
  const { app } = createServer({
    log: composition.log,
    bearerToken: composition.bearerToken,
    conversations: composition.conversations,
    cookieInsecure: composition.config.ui.cookieInsecure
  });
  registerHealthRoute(app, { version, startedAt: (/* @__PURE__ */ new Date()).toISOString() });
  registerAuthRoutes(app, { auth: composition.auth });
  registerConversationRoutes(app, { conversations: composition.conversations });
  registerMessageRoutes(app, {
    conversations: composition.conversations,
    uploadStoreFor: composition.uploadStoreFor
  });
  if (composition.config.ui.enabled) {
    const distDir = resolveUiDistDir(composition.config);
    if (!existsSync(distDir)) {
      composition.log.warn(
        `ui.enabled=true but ${distDir} does not exist. Run \`npm run build:ui\` or set ui.distDir.`
      );
    }
    registerUiRoutes(app, { distDir });
  }
  return app;
}
var registerGogogo = (program, io) => {
  const cmd = new Command("gogogo").description("start the june1815 HTTP app-server").option("--host <addr>", "override server.host").option("--port <n>", "override server.port", (v) => Number(v)).option("--auto-install", "allow unattended `claude` install when missing").option("--model <name>", "default model for new conversations").option("--effort <level>", "reasoning effort: low|medium|high|xhigh|max").action(async (raw, command) => {
    const common = command.parent?.opts() ?? {};
    const cliPartial = commonOptionsToConfig({ ...common, ...raw });
    if (raw.host) (cliPartial.server ??= {}).host = raw.host;
    if (raw.port) (cliPartial.server ??= {}).port = raw.port;
    if (raw.autoInstall) (cliPartial.claude ??= {}).autoInstall = true;
    const composition = await composeGogogo({
      cliPartial,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
      isTty: process.stdout.isTTY === true,
      env: process.env,
      home: homedir()
    });
    if (composition.mode === "interactive") intro2("june1815");
    const app = buildServerApp(composition, "0.0.0");
    const server = serve({
      fetch: app.fetch,
      hostname: composition.config.server.host,
      port: composition.config.server.port
    });
    const url = `http://${composition.config.server.host}:${composition.config.server.port}`;
    if (composition.mode === "interactive") {
      note2(`URL    ${url}
bearer  ${composition.bearerToken}`, "june1815 ready");
      outro2("press Ctrl-C to stop");
    } else {
      io.stdout(`${JSON.stringify({ url, token: composition.bearerToken })}
`);
    }
    const shutdown = async () => {
      await composition.conversations.destroyAll();
      server.close();
      io.exit(0);
    };
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  });
  applyCommonOptions(cmd);
  program.addCommand(cmd);
};
var ANSI_RE3 = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
var SEMVER_RE = /\b(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.+-]+)?\b/;
function stripAnsi2(s) {
  return s.replace(ANSI_RE3, "");
}
function parseClaudeVersion(stdout) {
  const cleaned = stripAnsi2(stdout).trim();
  const m = SEMVER_RE.exec(cleaned);
  if (!m?.[1] || !m[2] || !m[3]) {
    return { raw: cleaned, semver: null, parts: null };
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  return {
    raw: cleaned,
    semver: `${major}.${minor}.${patch}`,
    parts: { major, minor, patch }
  };
}
var realSpawn2 = {
  run: (cmd, args) => new Promise((resolve2) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("close", (code) => {
      resolve2({ code: code ?? 1, stdout, stderr });
    });
    child.on("error", (err) => {
      resolve2({ code: -1, stdout, stderr: err.message });
    });
  })
};
async function getClaudeVersion(claudePath, spawnFacade = realSpawn2) {
  const r = await spawnFacade.run(claudePath, ["--version"]);
  if (r.code !== 0) {
    return { raw: r.stderr.trim() || r.stdout.trim(), semver: null, parts: null };
  }
  return parseClaudeVersion(r.stdout);
}
function tick(status) {
  switch (status) {
    case "ok":
      return "[ok]";
    case "warn":
      return "[warn]";
    case "error":
      return "[error]";
  }
}
function format(checks) {
  const width = Math.max(...checks.map((c) => c.label.length));
  return checks.map((c) => `${tick(c.status).padEnd(8)} ${c.label.padEnd(width + 2)} ${c.value}`).join("\n");
}
var registerDoctor = (program, io) => {
  const cmd = new Command("doctor").description("diagnose june1815's runtime prerequisites").action(
    async (raw, command) => {
      const common = command.parent?.opts() ?? {};
      const cliPartial = commonOptionsToConfig({ ...common, ...raw });
      const config = loadConfig({ cliOverrides: cliPartial, env: process.env, homeDir: homedir() });
      const checks = [];
      const pathVar = process.env.PATH;
      const locatorInput = { pathVar, home: homedir(), platform: platform() };
      if (config.claude.path) locatorInput.overridePath = config.claude.path;
      const loc = locateClaude(locatorInput);
      if (loc.found) {
        let versionStr = "";
        try {
          const v = await getClaudeVersion(loc.path);
          versionStr = v.semver ? ` (v${v.semver})` : " (version unknown)";
        } catch {
          versionStr = " (version probe failed)";
        }
        checks.push({ label: "claude", value: `${loc.path}${versionStr}`, status: "ok" });
      } else {
        checks.push({
          label: "claude",
          value: `not found (searched ${loc.searched.length} locations)`,
          status: "error"
        });
      }
      const auth = detectAuth({
        env: process.env,
        homeDir: homedir(),
        dataDir: config.dataDir ?? join(homedir(), ".local", "share", "june1815")
      });
      checks.push({
        label: "auth source",
        value: auth.authenticated ? auth.source : "none (run `claude auth login` or set CLAUDE_CODE_OAUTH_TOKEN)",
        status: auth.authenticated ? "ok" : "warn"
      });
      const dataDir = config.dataDir ?? join(homedir(), ".local", "share", "june1815");
      checks.push({
        label: "data dir",
        value: `${dataDir} (${existsSync(dataDir) ? "exists" : "will be created on first use"})`,
        status: "ok"
      });
      checks.push({ label: "pty cols/rows", value: `${config.pty.cols} x ${config.pty.rows}`, status: "ok" });
      checks.push({
        label: "max conversations",
        value: String(config.limits.maxConversations),
        status: "ok"
      });
      checks.push({
        label: "http bind",
        value: `${config.server.host}:${config.server.port}`,
        status: "ok"
      });
      io.stdout(`${format(checks)}
`);
      if (checks.some((c) => c.status === "error")) io.exit(1);
    }
  );
  applyCommonOptions(cmd);
  program.addCommand(cmd);
};
var SECRET_PATHS = /* @__PURE__ */ new Set(["server.auth.bearerToken"]);
function redact(config) {
  return walk(config, "");
}
function walk(obj, prefix) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (SECRET_PATHS.has(path)) {
      out[k] = v === void 0 ? void 0 : "<redacted>";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = walk(v, path);
    } else {
      out[k] = v;
    }
  }
  return out;
}
var registerConfig = (program, io) => {
  const cfg = new Command("config").description("inspect or print example june1815 configuration");
  const show = new Command("show").description("print the resolved config tree (secrets redacted)").action((_opts, command) => {
    const common = command.parent?.parent?.opts() ?? {};
    const cliPartial = commonOptionsToConfig(common);
    const config = loadConfig({ cliOverrides: cliPartial, env: process.env, homeDir: homedir() });
    io.stdout(`${JSON.stringify(redact(config), null, 2)}
`);
  });
  applyCommonOptions(show);
  cfg.addCommand(show);
  const example = new Command("example").description("print the annotated june1815.example.yml").action(() => {
    const here = dirname$1(fileURLToPath$1(import.meta.url));
    const candidates = [
      join(here, "..", "..", "..", "june1815.example.yml"),
      join(here, "..", "..", "june1815.example.yml")
    ];
    let content = null;
    for (const c of candidates) {
      try {
        content = readFileSync(c, "utf8");
        break;
      } catch {
      }
    }
    if (content === null) {
      io.stderr("error: could not locate june1815.example.yml\n");
      io.exit(1);
      return;
    }
    io.stdout(content);
  });
  cfg.addCommand(example);
  program.addCommand(cfg);
};

// src/cli/shim/detect.ts
function isShimInvocation(argv2) {
  for (let i = 0; i < argv2.length; i += 1) {
    const token = argv2[i] ?? "";
    if (token === "-p" || token === "--print") return true;
    if (token === "--output-format" || token === "--input-format") {
      const value = argv2[i + 1] ?? "";
      if (value === "stream-json") return true;
    }
    if (token.startsWith("--output-format=") || token.startsWith("--input-format=")) {
      const value = token.slice(token.indexOf("=") + 1);
      if (value === "stream-json") return true;
    }
  }
  return false;
}

// src/tools/built-in-tool-defs.ts
var PATH_WITH_OPTIONAL_SIZE = "^(.+?)(?:\\s*\\((?:\\d+\\s*(?:bytes|lines)|new\\s+file)\\))?\\s*$";
var BUILT_IN_TOOL_DEFS = Object.freeze({
  version: 1,
  tools: Object.freeze({
    Read: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: "{1}" }
    },
    Bash: { input: { command: "{summary}" } },
    BashOutput: { input: { bash_id: "{summary}" } },
    KillShell: { input: { shell_id: "{summary}" } },
    Edit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: "{1}" }
    },
    Write: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: "{1}" }
    },
    MultiEdit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { file_path: "{1}" }
    },
    Grep: { input: { pattern: "{summary}" } },
    Glob: { input: { pattern: "{summary}" } },
    Task: { input: { description: "{summary}" } },
    Agent: { input: { description: "{summary}" } },
    WebFetch: { input: { url: "{summary}" } },
    WebSearch: { input: { query: "{summary}" } },
    TodoWrite: { input: { summary: "{summary}" } },
    NotebookEdit: {
      summaryRegex: PATH_WITH_OPTIONAL_SIZE,
      input: { notebook_path: "{1}" }
    }
  })
});
var ToolDefSchema = z.object({
  summaryRegex: z.string().min(1).optional(),
  input: z.record(z.string(), z.unknown())
});
var ToolDefsSchema = z.object({
  version: z.literal(1),
  tools: z.record(z.string().min(1), ToolDefSchema)
});

// src/tools/loader.ts
function loadToolDefs(opts = {}) {
  const warn = opts.io?.warn ?? ((s) => process.stderr.write(`${s}
`));
  const docs = [BUILT_IN_TOOL_DEFS];
  const candidatePaths = [];
  if (opts.envPaths) {
    for (const p of opts.envPaths) if (p.length > 0) candidatePaths.push(p);
  }
  if (opts.configDir) candidatePaths.push(join(opts.configDir, "tool-defs.json"));
  if (opts.cliPaths) {
    for (const p of opts.cliPaths) if (p.length > 0) candidatePaths.push(p);
  }
  for (const path of candidatePaths) {
    const doc = loadOne(path, warn);
    if (doc) docs.push(doc);
  }
  return docs;
}
function loadOne(path, warn) {
  if (!existsSync(path)) {
    return null;
  }
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    warn(`tool-defs: cannot read ${path}: ${err.message}`);
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    warn(`tool-defs: ${path} is not valid JSON: ${err.message}`);
    return null;
  }
  const result = ToolDefsSchema.safeParse(parsed);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? first.path.join(".") : "(root)";
    const msg = first ? first.message : "schema mismatch";
    warn(`tool-defs: ${path} validation failed at ${where}: ${msg}`);
    return null;
  }
  const narrowed = {};
  for (const [name, def] of Object.entries(result.data.tools)) {
    const entry = def.summaryRegex !== void 0 ? { summaryRegex: def.summaryRegex, input: def.input } : { input: def.input };
    if (def.summaryRegex !== void 0) {
      try {
        const re = new RegExp(def.summaryRegex, "u");
        if (!validateGroupReferences(def.input, re.source, name, warn, path)) {
          return null;
        }
      } catch (err) {
        warn(`tool-defs: ${path} tool '${name}' has invalid summaryRegex: ${err.message}`);
        return null;
      }
    }
    narrowed[name] = entry;
  }
  return { version: 1, tools: narrowed };
}
function validateGroupReferences(input, regexSource, toolName, warn, path) {
  const numberedGroupCount = countCapturingGroups(regexSource);
  const namedGroups = extractNamedGroups(regexSource);
  const stack = [input];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === "string") {
      const tokens = [...value.matchAll(/\{([^{}]+)\}/gu)].map((m) => (m[1] ?? "").trim());
      for (const tok of tokens) {
        if (tok === "summary" || tok.length === 0) continue;
        if (/^\d+$/u.test(tok)) {
          const idx = Number.parseInt(tok, 10);
          if (idx < 1 || idx > numberedGroupCount) {
            warn(
              `tool-defs: ${path} tool '${toolName}' references capture group {${tok}} but summaryRegex only has ${numberedGroupCount}`
            );
            return false;
          }
          continue;
        }
        if (!namedGroups.has(tok)) {
          warn(
            `tool-defs: ${path} tool '${toolName}' references named group {${tok}} which is not defined in summaryRegex`
          );
          return false;
        }
      }
    } else if (Array.isArray(value)) {
      for (const v of value) stack.push(v);
    } else if (value !== null && typeof value === "object") {
      for (const v of Object.values(value)) stack.push(v);
    }
  }
  return true;
}
function countCapturingGroups(source) {
  let count = 0;
  let inClass = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === "[") {
      inClass = true;
      continue;
    }
    if (c === "]") {
      inClass = false;
      continue;
    }
    if (inClass) continue;
    if (c !== "(") continue;
    const next = source[i + 1];
    if (next !== "?") {
      count += 1;
      continue;
    }
    const third = source[i + 2];
    if (third === "<" && source[i + 3] !== "=" && source[i + 3] !== "!") count += 1;
  }
  return count;
}
function extractNamedGroups(source) {
  const out = /* @__PURE__ */ new Set();
  const re = /\(\?<([A-Za-z_][A-Za-z0-9_]*)>/gu;
  let m;
  while ((m = re.exec(source)) !== null) {
    out.add(m[1] ?? "");
  }
  return out;
}

// src/tools/synthesizer.ts
var ToolInputSynthesizer = class _ToolInputSynthesizer {
  tools;
  constructor(tools) {
    this.tools = tools;
  }
  static fromDefs(defs) {
    const merged = /* @__PURE__ */ new Map();
    for (const doc of defs) {
      for (const [name, def] of Object.entries(doc.tools)) {
        merged.set(name, compile(def));
      }
    }
    return new _ToolInputSynthesizer(merged);
  }
  /**
   * Build the structured `input` object for a `tool_use` content block.
   *
   * Fallback strategy (in order):
   *   1. Tool name found and `summaryRegex` (if any) matched → interpolate
   *      `input` template with captured bindings.
   *   2. Tool name found but `summaryRegex` set and didn't match → return
   *      `{ summary }` (lossy but predictable).
   *   3. Tool name unknown → return `{ summary }`.
   */
  synthesize(name, summary) {
    const def = this.tools.get(name);
    if (!def) return { summary };
    let bindings = {
      summary,
      numbered: [],
      named: {}
    };
    if (def.regex) {
      const m = def.regex.exec(summary);
      if (!m) return { summary };
      bindings = {
        summary,
        // RegExpExecArray types capture-group slots as `string`, but at
        // runtime a non-participating optional group (`(?:foo)?`) returns
        // `undefined`. Coerce defensively.
        numbered: m.slice(1).map((g) => g ?? ""),
        named: { ...m.groups ?? {} }
      };
    }
    return interpolateValue(def.input, bindings);
  }
};
function compile(def) {
  if (def.summaryRegex === void 0) {
    return { input: def.input };
  }
  return { regex: new RegExp(def.summaryRegex, "u"), input: def.input };
}
function interpolateValue(value, b) {
  if (typeof value === "string") return interpolateString(value, b);
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, b));
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = interpolateValue(v, b);
    }
    return out;
  }
  return value;
}
function interpolateString(s, b) {
  return s.replace(/\{([^{}]+)\}/gu, (full, raw) => {
    const token = raw.trim();
    if (token === "summary") return b.summary;
    if (/^\d+$/u.test(token)) {
      const idx = Number.parseInt(token, 10);
      if (idx < 1) return full;
      const captured = b.numbered[idx - 1];
      return captured ?? "";
    }
    if (Object.prototype.hasOwnProperty.call(b.named, token)) {
      return b.named[token] ?? "";
    }
    return full;
  });
}

// src/cli/shim/arg-filter.ts
var VALUE_FLAGS = /* @__PURE__ */ new Set([
  "--output-format",
  "--input-format",
  "--permission-prompt-tool",
  "--settings",
  "--model",
  "--effort",
  "--add-dir",
  "--allowedTools",
  "--allowed-tools",
  "--disallowedTools",
  "--disallowed-tools",
  "--setting-sources",
  "--permission-mode",
  "--plugin-dir",
  "--append-system-prompt",
  "--resume",
  "--session-id",
  "--mcp-config",
  "--mcp-debug",
  "--cwd",
  "--tool-defs"
]);
var STRIPPED_BOOLEAN = /* @__PURE__ */ new Set([
  "-p",
  "--print",
  "--include-partial-messages",
  "--replay-user-messages"
]);
var STRIPPED_VALUE = /* @__PURE__ */ new Set([
  "--output-format",
  "--input-format",
  "--permission-prompt-tool"
]);
function splitArgs(rawArgv) {
  const passthrough = [];
  const stripped = [];
  let model;
  let effort;
  let permissionMode;
  let resume;
  let sessionId;
  let cwd;
  const toolDefs = [];
  const addDirs = [];
  let i = 0;
  while (i < rawArgv.length) {
    const token = rawArgv[i] ?? "";
    i += 1;
    if (token.startsWith("--") && token.includes("=")) {
      const eq = token.indexOf("=");
      const flag = token.slice(0, eq);
      const value = token.slice(eq + 1);
      processFlag(flag, value);
      continue;
    }
    if (STRIPPED_BOOLEAN.has(token)) {
      stripped.push(token);
      continue;
    }
    if (VALUE_FLAGS.has(token)) {
      const value = rawArgv[i] ?? "";
      i += 1;
      processFlag(token, value);
      continue;
    }
    passthrough.push(token);
  }
  function processFlag(flag, value) {
    if (STRIPPED_VALUE.has(flag)) {
      stripped.push(flag, value);
      return;
    }
    switch (flag) {
      case "--model":
        model = value;
        passthrough.push(flag, value);
        return;
      case "--effort":
        effort = value;
        passthrough.push(flag, value);
        return;
      case "--permission-mode":
        permissionMode = value;
        passthrough.push(flag, value);
        return;
      case "--resume":
        resume = value;
        passthrough.push(flag, value);
        return;
      case "--session-id":
        sessionId = value;
        passthrough.push(flag, value);
        return;
      case "--cwd":
        cwd = value;
        return;
      case "--tool-defs":
        toolDefs.push(value);
        return;
      case "--add-dir":
        addDirs.push(value);
        passthrough.push(flag, value);
        return;
      default:
        passthrough.push(flag, value);
    }
  }
  return {
    passthrough,
    stripped,
    extracted: {
      ...model !== void 0 ? { model } : {},
      ...effort !== void 0 ? { effort } : {},
      ...permissionMode !== void 0 ? { permissionMode } : {},
      ...resume !== void 0 ? { resume } : {},
      ...sessionId !== void 0 ? { sessionId } : {},
      ...cwd !== void 0 ? { cwd } : {},
      toolDefs,
      addDirs
    }
  };
}
var EventToStream = class {
  sessionId;
  cwd;
  model;
  permissionMode;
  synthesizer;
  now;
  uuid;
  turnStartedAt = 0;
  numTurns = 0;
  assistantText = "";
  assistantContent = [];
  blockIndex = 0;
  pendingErrors = [];
  usage = { input_tokens: 0, output_tokens: 0 };
  constructor(opts) {
    this.sessionId = opts.sessionId;
    this.cwd = opts.cwd;
    this.model = opts.model;
    this.permissionMode = opts.permissionMode;
    this.synthesizer = opts.synthesizer;
    this.now = opts.now ?? (() => Date.now());
    this.uuid = opts.uuid ?? (() => randomUUID());
  }
  /** Emit the one-time `system/init` line. */
  emitInit(sink) {
    const msg = {
      type: "system",
      subtype: "init",
      cwd: this.cwd,
      tools: [],
      mcp_servers: [],
      model: this.model,
      permissionMode: this.permissionMode,
      uuid: this.uuid(),
      session_id: this.sessionId
    };
    emit(sink, msg);
    this.turnStartedAt = this.now();
  }
  /** Mark a new turn as starting (resets per-turn buffers). */
  beginTurn() {
    this.assistantText = "";
    this.assistantContent = [];
    this.blockIndex = 0;
    this.pendingErrors = [];
    this.turnStartedAt = this.now();
  }
  /**
   * Route one `ConversationEvent` through the wire mapping. Returns the
   * lines emitted on this call so tests can introspect without touching
   * the sink — they're also written to `sink`.
   */
  announcedToolKeys = /* @__PURE__ */ new Set();
  onEvent(e, sink) {
    switch (e.type) {
      case "text_delta": {
        this.onText(e.text, sink);
        return;
      }
      case "reasoning_delta": {
        this.onThinking(e.text, sink);
        return;
      }
      case "tool_use": {
        this.onToolUse(e.name, e.summary ?? "", sink);
        return;
      }
      case "tool_result": {
        this.onToolUse(e.name, e.summary, sink);
        return;
      }
      case "usage":
        this.usage = {
          input_tokens: e.inputTokens,
          output_tokens: e.outputTokens
        };
        return;
      case "error":
        this.pendingErrors.push(`${e.code}: ${e.message}`);
        return;
      case "auth_required":
        this.pendingErrors.push(`auth_required: ${e.url}`);
        return;
      case "turn_complete": {
        this.flushTurn(sink);
        return;
      }
      case "ready":
      case "permission_prompt":
      case "trust_prompt":
      case "state_change":
      case "message_started":
      case "message_completed":
        return;
      case "pty_exited":
        this.pendingErrors.push(`pty_exited: code=${e.exitCode}`);
        {
          this.flushTurn(sink);
          return;
        }
      default:
        return;
    }
  }
  onText(delta, sink) {
    if (delta.length === 0) return;
    this.assistantText += delta;
    const msg = {
      type: "stream_event",
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: "content_block_delta",
        index: this.blockIndex,
        delta: { type: "text_delta", text: delta }
      }
    };
    emit(sink, msg);
  }
  onThinking(delta, sink) {
    if (delta.length === 0) return;
    const msg = {
      type: "stream_event",
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: "content_block_delta",
        index: this.blockIndex,
        delta: { type: "thinking_delta", thinking: delta }
      }
    };
    emit(sink, msg);
  }
  onToolUse(name, summary, sink) {
    const key = `${name}|${summary}`;
    if (this.announcedToolKeys.has(key)) return;
    this.announcedToolKeys.add(key);
    const input = this.synthesizer.synthesize(name, summary);
    const id = `toolu_${this.uuid()}`;
    this.blockIndex += 1;
    const start = {
      type: "stream_event",
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: {
        type: "content_block_start",
        index: this.blockIndex,
        content_block: { type: "tool_use", id, name, input }
      }
    };
    emit(sink, start);
    const stop = {
      type: "stream_event",
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      event: { type: "content_block_stop", index: this.blockIndex }
    };
    emit(sink, stop);
    const block = { type: "tool_use", id, name, input };
    this.assistantContent.push(block);
    this.blockIndex += 1;
  }
  flushTurn(sink) {
    this.numTurns += 1;
    const duration_ms = Math.max(0, this.now() - this.turnStartedAt);
    const finalContent = this.assistantText.length > 0 ? [...this.assistantContent, { type: "text", text: this.assistantText }] : [...this.assistantContent];
    const assistant = {
      type: "assistant",
      parent_tool_use_id: null,
      uuid: this.uuid(),
      session_id: this.sessionId,
      message: {
        id: `msg_${this.uuid()}`,
        type: "message",
        role: "assistant",
        model: this.model,
        content: finalContent,
        stop_reason: this.pendingErrors.length > 0 ? "error" : "end_turn",
        stop_sequence: null,
        usage: this.usage
      }
    };
    emit(sink, assistant);
    let result;
    if (this.pendingErrors.length > 0) {
      result = {
        type: "result",
        subtype: "error",
        duration_ms,
        duration_api_ms: duration_ms,
        is_error: true,
        num_turns: this.numTurns,
        result: this.assistantText,
        errors: [...this.pendingErrors],
        usage: this.usage,
        modelUsage: {},
        permission_denials: [],
        uuid: this.uuid(),
        session_id: this.sessionId
      };
    } else {
      result = {
        type: "result",
        subtype: "success",
        duration_ms,
        duration_api_ms: duration_ms,
        is_error: false,
        num_turns: this.numTurns,
        result: this.assistantText,
        stop_reason: "end_turn",
        total_cost_usd: 0,
        usage: this.usage,
        modelUsage: {},
        permission_denials: [],
        uuid: this.uuid(),
        session_id: this.sessionId
      };
    }
    emit(sink, result);
    this.assistantText = "";
    this.assistantContent = [];
    this.blockIndex = 0;
    this.pendingErrors = [];
    this.announcedToolKeys = /* @__PURE__ */ new Set();
  }
  /**
   * Emit a synthetic `result/error` directly. Used by the runner when
   * something fails before claude is even spawned (e.g. JUNE1815_CLAUDE_PATH
   * missing). Doesn't touch turn counters.
   */
  emitStartupError(sink, message) {
    const result = {
      type: "result",
      subtype: "error",
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      result: "",
      errors: [message],
      usage: { input_tokens: 0, output_tokens: 0 },
      modelUsage: {},
      permission_denials: [],
      uuid: this.uuid(),
      session_id: this.sessionId
    };
    emit(sink, result);
  }
};
function emit(sink, msg) {
  sink.write(`${JSON.stringify(msg)}
`);
}
async function* readUserInputs(stdin, deps = {}) {
  const warn = deps.warn ?? ((m) => process.stderr.write(`${m}
`));
  let pending = "";
  for await (const chunk of stdin) {
    pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl = pending.indexOf("\n");
    while (nl !== -1) {
      const line = pending.slice(0, nl).replace(/\r$/u, "");
      pending = pending.slice(nl + 1);
      nl = pending.indexOf("\n");
      if (line.length === 0) continue;
      const decoded = decodeLine(line, deps, warn);
      if (decoded) yield decoded;
    }
  }
  if (pending.length > 0) {
    const decoded = decodeLine(pending.replace(/\r$/u, ""), deps, warn);
    if (decoded) yield decoded;
  }
}
function decodeLine(line, deps, warn) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch (err) {
    warn(`shim: stdin line is not valid JSON: ${err.message}`);
    return null;
  }
  if (!isObject(parsed)) {
    warn("shim: stdin line is not a JSON object");
    return null;
  }
  const obj = parsed;
  if (obj.type !== "user") {
    return null;
  }
  const user = obj;
  const message = user.message;
  if (!message) {
    warn("shim: stdin line is missing `message`");
    return null;
  }
  const content = message.content;
  const messageId = randomUUID();
  const textParts = [];
  const attachmentsInput = [];
  const rawIgnoredBlocks = [];
  if (typeof content === "string") {
    textParts.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!isObject(block)) {
        rawIgnoredBlocks.push("(non-object block)");
        continue;
      }
      const b = block;
      if (b.type === "text" && typeof block.text === "string") {
        textParts.push(block.text);
        continue;
      }
      if (b.type === "image") {
        const src = block.source;
        if (isObject(src) && src.type === "base64" && typeof src.data === "string" && typeof src.media_type === "string") {
          const s = src;
          attachmentsInput.push({
            kind: "image",
            dataUrl: `data:${s.media_type};base64,${s.data}`,
            contentType: s.media_type
          });
          continue;
        }
      }
      rawIgnoredBlocks.push(b.type);
    }
  } else {
    warn("shim: user.message.content is neither string nor array");
    return null;
  }
  if (rawIgnoredBlocks.length > 0) {
    warn(`shim: dropped ${rawIgnoredBlocks.length} unsupported content block(s): ${rawIgnoredBlocks.join(", ")}`);
  }
  const saved = [];
  if (attachmentsInput.length > 0) {
    if (!deps.uploads) {
      warn("shim: image attachment present but no upload store configured; dropping");
    } else {
      for (let i = 0; i < attachmentsInput.length; i += 1) {
        try {
          const a = attachmentsInput[i];
          if (!a) continue;
          saved.push(deps.uploads.save(messageId, a, i));
        } catch (err) {
          warn(`shim: failed to save attachment[${i}]: ${err.message}`);
        }
      }
    }
  }
  const userText = textParts.join(" ").trim();
  const composed = composeMessageWithAttachments(userText, saved);
  return {
    messageId,
    text: composed,
    attachments: saved,
    rawIgnoredBlocks
  };
}
function isObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// src/cli/shim/runner.ts
var PTY_COLS = 200;
var PTY_ROWS = 50;
var PARSER_IDLE_QUIET_MS = 80;
async function runShim(opts) {
  const io = opts.io ?? {
    stdout: { write: (line) => process.stdout.write(line) },
    stderr: (msg) => process.stderr.write(msg)
  };
  const claudePath = opts.env.JUNE1815_CLAUDE_PATH ?? "";
  const split = splitArgs(opts.argv);
  const sessionId = split.extracted.sessionId ?? split.extracted.resume ?? randomUUID();
  const cwd = split.extracted.cwd ?? process.cwd();
  const model = split.extracted.model ?? "claude";
  const permissionMode = split.extracted.permissionMode ?? "bypassPermissions";
  const envSep = platform() === "win32" ? ";" : ":";
  const envPaths = (opts.env.JUNE1815_TOOL_DEFS ?? "").split(envSep).filter((s) => s.length > 0);
  const dataDir = opts.env.JUNE1815_DATA_DIR ?? join(homedir(), ".local", "share", "june1815");
  const configDirCandidate = join(homedir(), ".config", "june1815");
  const toolDefs = loadToolDefs({
    cliPaths: split.extracted.toolDefs,
    envPaths,
    configDir: configDirCandidate,
    io: { warn: (m) => {
      io.stderr(`${m}
`);
    } }
  });
  const synthesizer = ToolInputSynthesizer.fromDefs(toolDefs);
  const writer = new EventToStream({
    sessionId,
    cwd,
    model,
    permissionMode,
    synthesizer
  });
  writer.emitInit(io.stdout);
  if (claudePath.length === 0 || !existsSync(claudePath)) {
    writer.emitStartupError(
      io.stdout,
      claudePath.length === 0 ? "JUNE1815_CLAUDE_PATH is not set" : `JUNE1815_CLAUDE_PATH points to a non-existent path: ${claudePath}`
    );
    return 1;
  }
  const uploadsRoot = join(dataDir, "uploads", sessionId);
  mkdirSync(uploadsRoot, { recursive: true });
  const uploads = new UploadStore(uploadsRoot);
  const args = buildClaudeArgs({
    passthrough: split.passthrough,
    addDirs: split.extracted.addDirs,
    cwd,
    uploadsRoot
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
    ...opts.spawner ? { spawner: opts.spawner } : {}
  });
  const pendingCompletions = /* @__PURE__ */ new Set();
  let resolveIdle = null;
  const wakeIfIdle = () => {
    if (pendingCompletions.size === 0 && resolveIdle) {
      const r = resolveIdle;
      resolveIdle = null;
      r();
    }
  };
  const unsubscribe = conv.onEvent((e) => {
    if (e.type === "message_started") {
      writer.beginTurn();
      return;
    }
    writer.onEvent(e, io.stdout);
    if (e.type === "message_completed") {
      pendingCompletions.delete(e.messageId);
      wakeIfIdle();
    }
    if (e.type === "pty_exited") {
      pendingCompletions.clear();
      wakeIfIdle();
    }
  });
  let exitCode = 0;
  try {
    await conv.waitForReady(3e4);
    for await (const msg of readUserInputs(
      opts.stdin ?? process.stdin,
      { uploads, warn: (m) => {
        io.stderr(`${m}
`);
      } }
    )) {
      const id = sendInput(conv, msg);
      pendingCompletions.add(id);
    }
    if (pendingCompletions.size > 0) {
      await new Promise((resolve2) => {
        resolveIdle = resolve2;
      });
    }
  } catch (err) {
    writer.emitStartupError(io.stdout, `shim: ${err.message}`);
    exitCode = 1;
  } finally {
    unsubscribe();
    conv.kill();
  }
  return exitCode;
}
function buildClaudeArgs(input) {
  const out = [...input.passthrough];
  const has = (dir) => input.addDirs.some((d) => d === dir);
  if (!has(input.cwd)) {
    out.push("--add-dir", input.cwd);
  }
  if (!has(input.uploadsRoot)) {
    out.push("--add-dir", input.uploadsRoot);
  }
  return out;
}
function sendInput(conv, msg) {
  if (msg.attachments.length === 0) {
    return conv.send(msg.text);
  }
  return conv.sendWithAttachments({ text: msg.text, attachments: msg.attachments });
}
var JUNE1815_COMMANDS = /* @__PURE__ */ new Set(["gogogo", "doctor", "config"]);
function isJune1815Command(argv2) {
  if (argv2.length === 0) return true;
  const firstPositional = argv2.find((a) => !a.startsWith("-"));
  if (firstPositional === void 0) return true;
  return JUNE1815_COMMANDS.has(firstPositional);
}
function resolveWrappedClaude(env) {
  const override = env.JUNE1815_CLAUDE_PATH?.trim();
  if (override && existsSync(override)) return override;
  try {
    const found = execSync("command -v claude", { encoding: "utf8", env }).trim();
    if (found && existsSync(found)) return found;
  } catch {
  }
  return null;
}
function passthroughToClaude(argv2, env) {
  const claude = resolveWrappedClaude(env);
  if (!claude) {
    process.stderr.write(
      "june1815: cannot pass through to claude - set JUNE1815_CLAUDE_PATH or put claude on PATH\n"
    );
    return Promise.resolve(127);
  }
  return new Promise((resolve2) => {
    const child = spawn(claude, [...argv2], { stdio: "inherit", env });
    child.on("exit", (code, signal) => {
      resolve2(signal ? 1 : code ?? 0);
    });
    child.on("error", (err) => {
      process.stderr.write(`june1815: passthrough failed: ${err.message}
`);
      resolve2(127);
    });
  });
}

// package.json
var package_default = {
  version: "0.1.1"};

// src/cli/bin.ts
var argv = process.argv.slice(2);
if (isShimInvocation(argv)) {
  void runShim({ argv, env: process.env }).then(
    (code) => {
      process.exit(code);
    },
    (err) => {
      process.stderr.write(`shim: ${err.message}
`);
      process.exit(1);
    }
  );
} else if (isJune1815Command(argv)) {
  void runCli(process.argv, {
    version: package_default.version,
    registrars: [registerGogogo, registerDoctor, registerConfig]
  });
} else {
  void passthroughToClaude(argv, process.env).then(
    (code) => {
      process.exit(code);
    },
    (err) => {
      process.stderr.write(`june1815: ${err.message}
`);
      process.exit(1);
    }
  );
}
//# sourceMappingURL=bin.js.map
//# sourceMappingURL=bin.js.map