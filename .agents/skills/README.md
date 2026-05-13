# Skills

One file per non-trivial best practice june15 adopted, including the *why*
and the *how it shows up in the repo*. Use this directory as the rosetta
between general advice and the specific code patterns that implement it.

| File | What it covers |
| --- | --- |
| [typescript-strict.md](./typescript-strict.md) | Every strict TS flag we enable, why each matters |
| [esm-only-packaging.md](./esm-only-packaging.md) | ESM-only publishing, dual-package hazard, native-module shims |
| [tdd-discipline.md](./tdd-discipline.md) | Red→green→refactor with atomic commits, coverage thresholds |
| [pty-screen-scraping.md](./pty-screen-scraping.md) | Parsing a rendered TUI via xterm-headless snapshots |
| [sse-streaming.md](./sse-streaming.md) | Server-Sent Events vs WebSockets; framing; heartbeat |
| [zod-to-env-example.md](./zod-to-env-example.md) | Single-source-of-truth config; codegen for `.env.example` |
| [alloy-as-living-spec.md](./alloy-as-living-spec.md) | Using Alloy 6 to verify state machines |
| [multi-arch-docker-with-cache.md](./multi-arch-docker-with-cache.md) | BUILDPLATFORM, --link, cache mounts, buildx |

If you adopt one of these practices in another project, copy the file. Each
entry is intentionally narrow so it's portable.
