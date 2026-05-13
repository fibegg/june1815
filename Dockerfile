# syntax=docker/dockerfile:1.7

# ---- Stage 1: deps (production only) -----------------------------------
FROM --platform=$BUILDPLATFORM node:22-slim AS deps
WORKDIR /app
COPY --link package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---- Stage 2: build (includes dev deps + source) -----------------------
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app
COPY --link package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY --link . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---- Stage 3: runtime --------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    CI=false \
    JUNE15_DATA_DIR=/var/lib/june15

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        tini \
        ca-certificates \
        python3 \
        build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install the official claude CLI globally so `docker run june15 gogogo`
# works zero-config. Users can swap this out by building their own image.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g @anthropic-ai/claude-code --no-audit --no-fund \
 && find /usr/local/lib/node_modules -type f -name '*.map' -delete

RUN useradd -m -u 10001 -d /home/june15 june15 \
 && mkdir -p /var/lib/june15 \
 && chown -R june15:june15 /var/lib/june15

USER june15
WORKDIR /home/june15/app

COPY --link --from=build --chown=june15:june15 /app/dist ./dist
COPY --link --from=build --chown=june15:june15 /app/node_modules ./node_modules
COPY --link --from=build --chown=june15:june15 /app/package.json ./
COPY --link --from=build --chown=june15:june15 /app/june15.example.yml ./

EXPOSE 7150
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.JUNE15_PORT||7150)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--","node","dist/cli/bin.js"]
CMD ["gogogo","--host","0.0.0.0"]
