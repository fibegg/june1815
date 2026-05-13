import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command, type Command as CommanderCommand } from 'commander';
import { type Logger } from 'pino';
import { serve } from '@hono/node-server';
import { applyCommonOptions, commonOptionsToConfig, type CommonOptionValues } from '../cli-options.js';
import type { CommandRegistrar } from '../cli.js';
import { loadConfig } from '../../config/loader.js';
import type { Config, Mode } from '../../config/schema.js';
import { createLogger, loggerOptionsFromConfig } from '../../logger.js';
import { enrichedPath, locateClaude } from '../../claude/locator.js';
import { installOrThrow } from '../../claude/installer.js';
import { ProductionConversationFactory } from '../../conversation/factory.js';
import { ConversationManager } from '../../conversation/manager.js';
import { SessionMarkerStore } from '../../conversation/session-marker.js';
import { UploadStore } from '../../conversation/upload-store.js';
import { AuthService } from '../../server/auth-service.js';
import { createServer } from '../../server/server.js';
import { registerAuthRoutes } from '../../server/routes/auth.js';
import { registerConversationRoutes } from '../../server/routes/conversations.js';
import { registerHealthRoute } from '../../server/routes/health.js';
import { registerMessageRoutes } from '../../server/routes/messages.js';
import { registerUiRoutes } from '../../server/routes/ui.js';
import { clackConfirmPrompt, intro, note, outro } from '../prompts.js';
import { June15Error } from '../../errors.js';

interface GogogoOptions extends CommonOptionValues {
  host?: string;
  port?: number;
  autoInstall?: boolean;
  model?: string;
  effort?: string;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function defaultDataDir(home: string): string {
  return join(home, '.local', 'share', 'june15');
}

function effectiveMode(config: Config, isTty: boolean): Mode {
  return config.mode ?? (isTty ? 'interactive' : 'headless');
}

function buildBearerToken(config: Config): string {
  return config.server.auth.bearerToken ?? randomBytes(24).toString('hex');
}

/** Pure composition step — builds every collaborator from a resolved
 *  Config. Exposed for testing without listening on a socket. */
export interface GogogoComposition {
  config: Config;
  mode: Mode;
  log: Logger;
  conversations: ConversationManager;
  auth: AuthService;
  bearerToken: string;
  factory: ProductionConversationFactory;
  claudePath: string;
  uploadStoreFor: (conversationId: string) => UploadStore;
}

export async function composeGogogo(opts: {
  cliPartial: DeepPartial<Config>;
  isTty: boolean;
  env: NodeJS.ProcessEnv;
  home: string;
  log?: Logger;
}): Promise<GogogoComposition> {
  const config = loadConfig({
    cliOverrides: opts.cliPartial,
    env: opts.env,
    homeDir: opts.home,
  });
  const mode = effectiveMode(config, opts.isTty);
  const log =
    opts.log ?? createLogger(loggerOptionsFromConfig(config, opts.isTty));

  // 1. Locate or install claude.
  const pathVar = opts.env.PATH;
  const locatorInput: Parameters<typeof locateClaude>[0] = {
    pathVar,
    home: opts.home,
  };
  if (config.claude.path) locatorInput.overridePath = config.claude.path;
  let resolved = locateClaude(locatorInput);
  if (!resolved.found) {
    log.warn('claude not found on PATH; attempting install per config');
    const installInput: Parameters<typeof installOrThrow>[0] = {
      mode,
      autoInstall: config.claude.autoInstall,
      log: { info: (m) => { log.info(m); }, warn: (m) => { log.warn(m); } },
    };
    if (mode === 'interactive') installInput.prompt = clackConfirmPrompt;
    await installOrThrow(installInput);
    resolved = locateClaude(locatorInput);
    if (!resolved.found) {
      throw new June15Error(
        'claude_not_found',
        'install reported success but claude still not on PATH',
      );
    }
  }

  // 2. Auth service + check.
  const dataDir = config.dataDir ?? defaultDataDir(opts.home);
  const auth = new AuthService({
    dataDir,
    homeDir: opts.home,
    env: opts.env,
    claudePath: resolved.path,
  });
  const authInfo = await auth.status();
  if (!authInfo.authenticated) {
    log.warn(
      'no claude authentication detected (env vars, token file, ~/.claude/.credentials.json, ' +
        'or `claude auth status`). New conversations will fail until you authenticate.',
    );
  } else {
    log.info({ source: authInfo.source }, 'auth source resolved');
  }

  // 3. Conversation factory + manager.
  const childEnv: NodeJS.ProcessEnv = {
    ...opts.env,
    PATH: enrichedPath({ pathVar, home: opts.home }),
  };
  const uploadsRoot = join(dataDir, 'uploads');
  const factory = new ProductionConversationFactory({
    claudePath: resolved.path,
    env: childEnv,
    cols: config.pty.cols,
    rows: config.pty.rows,
    idleQuietMs: config.pty.idleQuietMs,
    uploadsRoot,
  });
  const markers = new SessionMarkerStore(dataDir);
  const conversations = new ConversationManager({
    factory,
    markers,
    maxConversations: config.limits.maxConversations,
  });
  const uploadStoreFor = (conversationId: string): UploadStore =>
    new UploadStore(join(uploadsRoot, conversationId));

  return {
    config,
    mode,
    log,
    conversations,
    auth,
    bearerToken: buildBearerToken(config),
    factory,
    claudePath: resolved.path,
    uploadStoreFor,
  };
}

function resolveUiDistDir(config: Config): string {
  if (config.ui.distDir) return config.ui.distDir;
  // Default: dist/ui sibling of the running JS file. Works in both
  // src/ (during tests) and dist/ (after build) layouts.
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'ui');
}

export function buildServerApp(composition: GogogoComposition, version: string): ReturnType<typeof createServer>['app'] {
  const { app } = createServer({
    log: composition.log,
    bearerToken: composition.bearerToken,
    conversations: composition.conversations,
    cookieInsecure: composition.config.ui.cookieInsecure,
  });
  registerHealthRoute(app, { version, startedAt: new Date().toISOString() });
  registerAuthRoutes(app, { auth: composition.auth });
  registerConversationRoutes(app, { conversations: composition.conversations });
  registerMessageRoutes(app, {
    conversations: composition.conversations,
    uploadStoreFor: composition.uploadStoreFor,
  });
  if (composition.config.ui.enabled) {
    const distDir = resolveUiDistDir(composition.config);
    if (!existsSync(distDir)) {
      composition.log.warn(
        `ui.enabled=true but ${distDir} does not exist. Run \`npm run build:ui\` or set ui.distDir.`,
      );
    }
    registerUiRoutes(app, { distDir });
  }
  return app;
}

export const registerGogogo: CommandRegistrar = (program, io) => {
  const cmd = new Command('gogogo')
    .description('start the june15 HTTP app-server')
    .option('--host <addr>', 'override server.host')
    .option('--port <n>', 'override server.port', (v) => Number(v))
    .option('--auto-install', 'allow unattended `claude` install when missing')
    .option('--model <name>', 'default model for new conversations')
    .option('--effort <level>', 'reasoning effort: low|medium|high|xhigh|max')
    .action(async (raw: GogogoOptions, command: CommanderCommand) => {
      const common = (command.parent?.opts() ?? {});
      const cliPartial = commonOptionsToConfig({ ...common, ...raw });
      if (raw.host) (cliPartial.server ??= {}).host = raw.host;
      if (raw.port) (cliPartial.server ??= {}).port = raw.port;
      if (raw.autoInstall) (cliPartial.claude ??= {}).autoInstall = true;

      const composition = await composeGogogo({
        cliPartial,
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-boolean-literal-compare
        isTty: process.stdout.isTTY === true,
        env: process.env,
        home: homedir(),
      });

      if (composition.mode === 'interactive') intro('june15');
      const app = buildServerApp(composition, '0.0.0');
      const server = serve({
        fetch: app.fetch,
        hostname: composition.config.server.host,
        port: composition.config.server.port,
      });
      const url = `http://${composition.config.server.host}:${composition.config.server.port}`;
      if (composition.mode === 'interactive') {
        note(`URL    ${url}\nbearer  ${composition.bearerToken}`, 'june15 ready');
        outro('press Ctrl-C to stop');
      } else {
        io.stdout(`${JSON.stringify({ url, token: composition.bearerToken })}\n`);
      }

      const shutdown = async (): Promise<void> => {
        await composition.conversations.destroyAll();
        server.close();
        io.exit(0);
      };
      process.on('SIGINT', () => void shutdown());
      process.on('SIGTERM', () => void shutdown());
    });
  applyCommonOptions(cmd);
  program.addCommand(cmd);
};
