# ADR-0008: Hono as the HTTP framework

- **Status**: Accepted
- **Date**: 2026-05-13

## Context

The HTTP layer needs to serve REST JSON endpoints and stream Server-Sent Events. It also has to be testable without spinning up a real socket — we want to fire fetch-shaped requests at an in-process app object.

## Decision

We use **Hono** with `@hono/node-server`. Hono is a routing layer built around the Fetch API; it runs on Node, Deno, Bun, Cloudflare Workers, and edge runtimes. For june1815 only Node matters, but Hono's Fetch-API surface means tests can call `app.fetch(new Request(...))` directly without a server socket.

SSE is supported natively via `hono/streaming`'s `streamSSE` helper, which is the cleanest SSE implementation among Node-side frameworks we surveyed.

## Consequences

**Easier**
- In-process testing: pass a `Request`, get a `Response`. No supertest, no port allocation.
- Tiny bundle footprint (~30 KB), composable middleware shape, first-class TypeScript types.
- SSE just works — the helper handles framing, retry hints, and connection close.

**Harder**
- Smaller ecosystem of plugins than Express. Most plugins we'd want (auth, logging, request-id) are trivial to write inline anyway and live in `src/server/middleware/`.

## Alternatives considered

- **Fastify** — Mature, plugin-rich, fast. Heavier than Hono and its testing story still wants a server socket.
- **Express** — Ubiquitous but its streaming model fights modern SSE; large surface area dragged in for what we use.
- **Raw `node:http`** — We'd reinvent routing, middleware, and SSE framing. Cost > benefit.
