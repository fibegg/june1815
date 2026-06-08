# Bearer auth that survives static-asset fetches

## When to use

Any project where you need to require a bearer token on every HTTP
endpoint — including the HTML/JS/CSS of a browser UI — and you can't
ask the browser to inject `Authorization: Bearer ...` on the initial
document fetch typed into the address bar.

## The trick

Accept the same token from three carriers, in order:

1. `Authorization: Bearer <token>` (programmatic clients)
2. `?token=<token>` query parameter (browser address bar)
3. `Cookie: <name>=<token>` (set automatically once on a successful
   header/query auth)

On a successful **GET** authenticated via header or query, the
middleware plants the cookie. Subsequent asset fetches (which can't
include custom headers) ride on the cookie. Cookie-sourced auths do not
re-plant; non-GET responses don't carry `Set-Cookie`.

## Hygiene

- `HttpOnly; SameSite=Strict` — JS can't read the token; cross-site
  POSTs don't carry it.
- Token compare is constant-time (XOR-accumulate over equal-length
  strings).
- The `Secure` flag is configurable (`cookieInsecure`) because local
  development binds to plain HTTP on `127.0.0.1`.
- Carve out one or two truly public paths (`/healthz`) via a
  `publicPaths` allowlist — never carve out the UI.

## Where it shows up in june1815

- `src/server/middleware/bearer-auth.ts` — the three-source check plus
  the cookie planting.
- `src/server/server.ts` — middleware mounted globally (`*`) with
  `publicPaths: ['/healthz']`.
- `ui/src/lib/api.ts` — `captureTokenFromUrl()` strips `?token=` from
  the URL after capturing it so it doesn't sit in browser history.

## Watch out for

- Reverse proxies that strip cookies on cache-related paths. Add
  `Cache-Control: no-cache` on responses that carry `Set-Cookie`.
- `?token=` ending up in server logs. june1815's request logger does not
  log query strings; if you copy this pattern, make sure yours does the
  same.
