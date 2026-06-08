# Multi-arch Docker with cache

## When to use

Any image you intend to ship to both amd64 (laptops, cloud VMs) and
arm64 (Apple Silicon, Graviton, modern Pi). With buildx, multi-arch is
free in CI and only a little slower locally.

## Three patterns to combine

### 1. BUILDPLATFORM-pinned builders

For builder stages that don't ship in the final image (deps install,
TypeScript compile), pin them to the native build architecture:

```
FROM --platform=$BUILDPLATFORM node:22-slim AS deps
```

`$BUILDPLATFORM` resolves to the architecture of the machine running
docker buildx (usually amd64 in CI). The build runs natively for those
stages — no QEMU emulation tax during `npm install`.

The runtime stage stays unpinned and is built per-target:

```
FROM node:22-slim AS runtime
```

For each target platform, the runtime stage is built natively (under
QEMU if cross-arch). The fast builder layers are reused across targets.

### 2. --link + --mount=type=cache

```
COPY --link package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
```

`--link` enables modern OverlayFS-style layer dedup — incremental
COPYs touch fewer bytes.

`--mount=type=cache` mounts a persistent cache for that RUN step only,
shared across builds. `npm ci` becomes "download cache hits, install".

### 3. GitHub Actions cache (gha)

```yaml
- uses: docker/build-push-action@v6
  with:
    cache-from: type=gha,scope=docker
    cache-to: type=gha,scope=docker,mode=max
```

`type=gha` stores the buildx layer cache in GitHub's blob store, scoped
by `scope` (we use `docker` to share across our docker workflow runs).
`mode=max` caches every layer, not just the final one — costs more
storage, dramatically faster on near-identical rebuilds.

## Where it shows up in june1815

- `Dockerfile` — three stages (deps/build/runtime), BUILDPLATFORM
  pinned on the two builder stages, --link COPY everywhere, npm cache
  mount on every npm step.
- `.dockerignore` — whitelist (`*` then explicit allows) keeps the build
  context small.
- `.github/workflows/docker.yml` — QEMU + buildx + multi-arch
  `linux/amd64,linux/arm64`, gha cache scope=docker, metadata-action for
  tag matrix (latest / branch / semver / sha).
