# Auth and Config Priority

Companion for [`auth_config_priority.als`](./auth_config_priority.als). Two
resolution functions are modelled together because they share the same
"highest-precedence wins" shape and the same need for totality + determinism.

## Auth source resolution

| Source | Precedence (higher wins) |
| --- | --- |
| `EnvOAuthToken` (`CLAUDE_CODE_OAUTH_TOKEN`) | 5 |
| `EnvAnthropicKey` (`ANTHROPIC_API_KEY`) | 4 |
| `EnvClaudeKey` (`CLAUDE_API_KEY`) | 3 |
| `Junе15TokenFile` (`<dataDir>/agent_token.txt`) | 2 |
| `ClaudeCredentials` (`~/.claude/.credentials.json`) | 1 |
| `None` | 0 (always present, lowest) |

If a higher source is *present*, lower sources are ignored. `None` is always
"present" in the spec so that resolution is total — every world produces an
answer, never an undefined.

## Config source resolution

| Source | Precedence |
| --- | --- |
| `CLIArg` | 4 |
| `ProcessEnv` | 3 |
| `ProjectYaml` (`./june1815.yml`) | 2 |
| `UserYaml` (`~/.config/june1815/june1815.yml`) | 1 |
| `BuiltinDefault` | 0 (always present) |

For any given key, resolution returns the value from the highest-precedence
source that has that key set.

## Invariants verified

- **`authResolutionTotal`** — Every world has an `authResolved` value (at minimum `None`).
- **`authResolutionDeterministic`** — Two worlds with identical source-presence sets resolve to the same value.
- **`authMonotone`** — Adding a higher-precedence source can only override; it never causes resolution to fall back to a lower source.
- **`configResolutionTotal`** — Every key resolves to exactly one value across the merged tree.
- **`configMonotone`** — Adding `CLIArg` to a world can never make `Env`/`Yaml` values prevail; CLI wins by definition.
