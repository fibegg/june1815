import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ZodError } from 'zod';
import { June15Error } from '../errors.js';
import { ENV_KEYS, type EnvKeyDef } from './env-keys.js';
import { type Config, ConfigSchema } from './schema.js';
import { parseYaml } from './yaml.js';

/** Minimal filesystem facade so the loader is fully unit-testable. */
export interface FsFacade {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: 'utf8'): string;
}

const realFs: FsFacade = {
  existsSync,
  readFileSync: (p, e) => readFileSync(p, e),
};

export interface LoaderInput {
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

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge two plain-object trees. The `over` tree wins for leaves.
 * Arrays and primitives are replaced wholesale. Returns a new object;
 * inputs are not mutated.
 */
export function deepMerge(base: PlainObject, over: PlainObject): PlainObject {
  const result: PlainObject = { ...base };
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

function coerce(raw: string, type: EnvKeyDef['type']): unknown {
  switch (type) {
    case 'string':
      return raw;
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case 'boolean': {
      const v = raw.toLowerCase().trim();
      if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
      if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
      return raw;
    }
  }
}

function setDeep(target: PlainObject, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.');
  let cursor: PlainObject = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]!;
    const next = cursor[key];
    if (isPlainObject(next)) {
      cursor = next;
    } else {
      const fresh: PlainObject = {};
      cursor[key] = fresh;
      cursor = fresh;
    }
  }
  cursor[parts[parts.length - 1]!] = value;
}

export function envToPartial(env: NodeJS.ProcessEnv): PlainObject {
  const out: PlainObject = {};
  for (const def of ENV_KEYS) {
    const raw = env[def.env];
    if (raw === undefined) continue;
    if (raw.trim().length === 0) continue;
    setDeep(out, def.yaml, coerce(raw, def.type));
  }
  return out;
}

function loadYamlFile(path: string, fs: FsFacade): PlainObject {
  if (!fs.existsSync(path)) return {};
  let content: string;
  try {
    content = fs.readFileSync(path, 'utf8');
  } catch (err) {
    throw new June15Error('config_yaml_read', `failed to read ${path}: ${(err as Error).message}`, {
      path,
    });
  }
  return parseYaml(content, path);
}

/**
 * Resolve the final, validated config. Precedence (high to low):
 *  1. cliOverrides
 *  2. process.env (mapped via ENV_KEYS)
 *  3. ./june15.yml  (or `configPath` if provided)
 *  4. ~/.config/june15/june15.yml
 *  5. ConfigSchema defaults
 */
export function loadConfig(input: LoaderInput = {}): Config {
  const cwd = input.cwd ?? process.cwd();
  const home = input.homeDir ?? homedir();
  const env = input.env ?? process.env;
  const fs = input.fs ?? realFs;

  const projectYamlPath = input.configPath ?? join(cwd, 'june15.yml');
  const userYamlPath = join(home, '.config', 'june15', 'june15.yml');

  const userYaml = loadYamlFile(userYamlPath, fs);
  const projectYaml = loadYamlFile(projectYamlPath, fs);
  const envPartial = envToPartial(env);
  const cliPartial = (input.cliOverrides ?? {}) as PlainObject;

  const merged = deepMerge(
    deepMerge(deepMerge(userYaml, projectYaml), envPartial),
    cliPartial,
  );

  const parsed = ConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw configError(parsed.error);
  }
  return parsed.data;
}

function configError(zodErr: ZodError): June15Error {
  const issues = zodErr.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
  return new June15Error('config_invalid', `config validation failed: ${issues}`, {
    issues: zodErr.issues,
  });
}
