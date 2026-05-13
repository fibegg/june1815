# ADR-0010: Bearer everywhere with a cookie carry-over

- **Status**: Accepted
- **Date**: 2026-05-14

## Context

The project requires that "all HTTP endpoints (UI/API) must be protected with
Bearer TOKEN header" — including the browser UI's static assets. A naive
implementation has two awkward corners:

1. Browsers cannot inject a custom `Authorization` header into the initial
   request for a typed-into-the-address-bar URL.
2. Asset fetches (JS, CSS, fonts) inherit the document's headers, not the
   one we set on the fetch call — so the bearer can't be threaded through
   them by client code alone.

## Decision

The bearer middleware accepts **any** of three carriers, in order:

1. `Authorization: Bearer <token>` header
2. `?token=<token>` query parameter
3. `Cookie: june15_token=<token>` (set by the middleware itself)

On a successful header- or query-sourced auth for a `GET`, the middleware
plants a `HttpOnly; SameSite=Strict` cookie carrying the same token. From
that point on, asset and document fetches in the same tab succeed without
any client-side wiring. Cookie-sourced auths do not re-plant the cookie,
and non-`GET` requests don't receive `Set-Cookie` (so REST API responses
stay clean).

The `Secure` flag is omitted by default (`cookieInsecure: true`) so the
cookie works over plain HTTP on `127.0.0.1`. Deployments behind TLS set
`cookieInsecure: false`.

The `bearerAuthMiddleware` is mounted globally (`*`) with `publicPaths:
['/healthz']`, replacing the earlier `/v1/*`-only mount. Every other path
— API and UI alike — passes through it.

## Consequences

**Easier**
- A user can open `http://localhost:7150/?token=...` and the SPA + its
  assets all load without further configuration.
- Programmatic clients keep using `Authorization: Bearer ...`.
- Constant-time token compare lives in one place.

**Harder**
- The cookie creates a small "first GET trades a session" affordance that
  must be reasoned about whenever new public paths are added.
- Operators behind TLS need to flip `cookieInsecure: false` or the cookie
  won't be honored.

## Alternatives considered

- **Serve UI assets unauthenticated, gate API only** — fibe-agent's
  pattern. Rejected here because the project requirement is stricter.
- **Server-side session login endpoint** — adds a login page and a CSRF
  surface for a tool meant to be opened from a CLI-printed URL.
- **Cookie-only auth** — removes header-bearer compatibility for
  programmatic clients. Header is the lingua franca of HTTP automation.
