# Alloy as a living spec

## When to use

When a design has invariants that span multiple states or actors and
unit tests would be either flaky or incomprehensible. Examples:

- State machines (lifecycle of a session, of a turn).
- Resource priority resolution (auth source, config merge).
- Queue/scheduler properties (FIFO, exactly-once, no-double-delivery).
- API contracts (sequence of events visible to a client).

## How we structure each suite

Two files per topic, in `docs/alloy/`:

- **`<topic>.md`** — companion. Tables of transitions, Mermaid state
  diagrams, prose contract, and the list of `run` / `check` commands
  with what they prove.
- **`<topic>.als`** — the runnable Alloy 6 module. Module declaration,
  signatures, predicates, a `traces` fact (for temporal modules), `run`
  commands (expected SAT) and `check` commands (expected UNSAT).

## Conventions

- One `.als` per topic, fully self-contained (no `private open`).
  Each is independently runnable.
- Use Alloy 6's built-in LTL (`var`, `'`, `always`, `eventually`,
  `after`, `once`) instead of importing `util/ordering`.
- Reachability (positive scenarios) is `run`; safety is `check`.
- Findings — known but un-fixed wart — are named `Finding_<thing>` and
  the README's "Reading the results" section explains how to treat them.

## Running

`scripts/run-alloy.sh` wraps the analyzer for the whole suite or one
named module. CI downloads the Alloy 6.2.0 fat jar (cached) and runs
the same script.

## Why bother

A test that proves an invariant for one set of inputs is one data point.
An Alloy `check` proves the invariant for *every* state up to a bound.
For the kinds of properties we care about (queue ordering, lifecycle
totality, resolution determinism) that's the difference between "I have
confidence" and "I have a proof, bounded".

## Where it shows up in june15

- `docs/alloy/session_lifecycle.{md,als}`
- `docs/alloy/message_queue.{md,als}`
- `docs/alloy/auth_config_priority.{md,als}`
- `docs/alloy/http_api_contract.{md,als}`
- `scripts/run-alloy.sh` + the `alloy` job in `.github/workflows/ci.yml`.
