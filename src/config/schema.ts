import { z } from 'zod';

/**
 * Server (HTTP) configuration.
 *
 * `auth.bearerToken` is optional in the schema because june1815 generates a
 * random token on first boot if none is supplied. The generated value is
 * printed to stdout (interactive mode) or stderr (headless mode) so the
 * operator can copy it.
 */
export const ServerConfigSchema = z
  .object({
    host: z.string().min(1).default('127.0.0.1'),
    port: z.number().int().min(1).max(65535).default(7150),
    auth: z
      .object({
        bearerToken: z.string().min(16).optional(),
      })
      .default({}),
  })
  .default({});

export const ClaudeConfigSchema = z
  .object({
    path: z.string().optional(),
    autoInstall: z.boolean().default(false),
  })
  .default({});

export const PtyConfigSchema = z
  .object({
    cols: z.number().int().min(80).max(500).default(200),
    rows: z.number().int().min(20).max(200).default(50),
    idleQuietMs: z.number().int().min(1).max(1000).default(10),
  })
  .default({});

export const LoggerConfigSchema = z
  .object({
    level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    pretty: z.boolean().optional(),
  })
  .default({});

export const LimitsConfigSchema = z
  .object({
    maxConversations: z.number().int().min(1).max(64).default(8),
  })
  .default({});

export const UiConfigSchema = z
  .object({
    /** When true, june1815 serves the bundled chat UI from `dist/ui/`. */
    enabled: z.boolean().default(false),
    /** Override the path to the built UI directory. Default is the
     *  package-relative `dist/ui` which the published tarball ships. */
    distDir: z.string().optional(),
    /** When true, the cookie planted by the bearer middleware omits the
     *  `Secure` flag so it works over plain HTTP. Default true (june1815 is
     *  typically bound to 127.0.0.1). Set false behind TLS. */
    cookieInsecure: z.boolean().default(true),
  })
  .default({});

export const ModeSchema = z.enum(['interactive', 'headless']);

export const ConfigSchema = z
  .object({
    mode: ModeSchema.optional(),
    dataDir: z.string().optional(),
    server: ServerConfigSchema,
    claude: ClaudeConfigSchema,
    pty: PtyConfigSchema,
    logger: LoggerConfigSchema,
    limits: LimitsConfigSchema,
    ui: UiConfigSchema,
  })
  .strict();

export type Config = z.infer<typeof ConfigSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type PtyConfig = z.infer<typeof PtyConfigSchema>;
export type LoggerConfig = z.infer<typeof LoggerConfigSchema>;
export type LimitsConfig = z.infer<typeof LimitsConfigSchema>;
export type UiConfig = z.infer<typeof UiConfigSchema>;
export type Mode = z.infer<typeof ModeSchema>;
