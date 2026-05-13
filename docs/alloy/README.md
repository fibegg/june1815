# june15 Alloy Models

This directory holds small, runnable Alloy specifications for the design
invariants that june15's tests cannot easily express by themselves. They are
**executable specs** — the analyzer either confirms each invariant holds for
all bounded states or returns a concrete counterexample.

## Running

Install Alloy 6.2.0 (or newer) and an OpenJDK runtime, then run:

```sh
scripts/run-alloy.sh                          # all suites
scripts/run-alloy.sh session_lifecycle        # one suite
```

The script wraps:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/alloy exec -f -t json \
  -o /tmp/june15-alloy-<suite> \
  -c '*' docs/alloy/<suite>.als
```

CI runs `scripts/run-alloy.sh` on Ubuntu after installing `alloy-analyzer` via
Homebrew on Linux. Local macOS development assumes Homebrew paths shown above.

## Suites

| File | Models | Pair |
| --- | --- | --- |
| `session_lifecycle.als` | PTY-child state machine: Spawned → Ready → Busy → Idle → Killed | [`session_lifecycle.md`](./session_lifecycle.md) |
| `message_queue.als` | Per-conversation FIFO queue with mid-turn steering | [`message_queue.md`](./message_queue.md) |
| `auth_config_priority.als` | Auth source resolution and config merge precedence | [`auth_config_priority.md`](./auth_config_priority.md) |
| `http_api_contract.als` | SSE event sequences observable to HTTP clients | [`http_api_contract.md`](./http_api_contract.md) |

## Reading the results

For each suite:

- `run` commands assert a scenario is **reachable**; they should be SAT.
- `check` commands assert a safety property; they should be UNSAT (no
  counterexample). A SAT result on a `check` is a found bug in the spec or
  in the contract — investigate.
- Commands prefixed with `Finding_` intentionally exhibit a known wart in the
  current code that the spec is calling out. Treat them as actionable issues,
  not as accepted behavior.

## Conventions

- Each `.als` file is a self-contained `module` — no cross-file `open`. This
  keeps each suite independently runnable.
- Temporal predicates (`always`, `eventually`, `after`, `;`) use Alloy 6's
  built-in LTL extension. No `util/ordering` import is required.
- The companion `.md` describes the contract in prose, includes a Mermaid
  state diagram where applicable, and links predicates to the file:line they
  prove.
