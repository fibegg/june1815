import jsYaml from 'js-yaml';
import { June1815Error } from '../errors.js';

/**
 * Parse a YAML string into a plain object. Returns an empty object for
 * empty/whitespace input. Throws `June1815Error('config_yaml_parse')` on
 * malformed YAML or on non-object root values.
 */
export function parseYaml(content: string, source: string): Record<string, unknown> {
  if (content.trim().length === 0) return {};

  let parsed: unknown;
  try {
    parsed = jsYaml.load(content);
  } catch (err) {
    throw new June1815Error(
      'config_yaml_parse',
      `failed to parse YAML from ${source}: ${(err as Error).message}`,
      { source },
    );
  }

  if (parsed == null) return {};
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new June1815Error(
      'config_yaml_parse',
      `YAML at ${source} must be a mapping at the root; got ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
      { source },
    );
  }
  return parsed as Record<string, unknown>;
}
