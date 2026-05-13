# Security Policy

## Reporting a vulnerability

Please email `security@fibegg.com` with a description of the issue, a
proof-of-concept if possible, and the impact you observe. We aim to
acknowledge reports within 72 hours.

Do not open a public GitHub issue for an unpatched vulnerability.

## Threat model

june15 runs locally and exposes an HTTP server (by default on
`127.0.0.1`). Treat it as a local-only privilege boundary: anyone who
can reach the bearer token has full control over the wrapped `claude`
process and any tools claude can invoke.

- Never expose the server on `0.0.0.0` without an ingress that enforces
  TLS and authentication of its own.
- The bearer token is generated on each boot if not configured; the
  random value is at least 24 bytes. Treat it as a secret.
- The `claude` binary inherits the spawning environment. Don't run
  june15 with elevated privileges if you wouldn't run claude with them.

## What we patch

- Crashes in june15 itself triggered by valid HTTP input or by malicious
  PTY content.
- Information leaks (tokens, paths) over the HTTP surface.
- Privilege escalation via the wrapped TUI's affordances if june15
  fails to gate them on bearer auth.

## What we don't patch here

- Vulnerabilities in the upstream `claude` CLI — report those directly
  to Anthropic.
- Misconfigurations on the operator's host (open ports, weak SSH keys,
  etc.).
