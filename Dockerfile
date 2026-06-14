# syntax=docker/dockerfile:1.7

# ---- Stage 1: deps (production only) -----------------------------------
FROM --platform=$BUILDPLATFORM node:22-slim AS deps
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY --link package.json package-lock.json* ./
COPY --link scripts/fix-node-pty.mjs ./scripts/fix-node-pty.mjs
COPY --link ui/package.json ./ui/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund

# ---- Stage 2: build (includes dev deps + source) -----------------------
FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        python3 \
        build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY --link package.json package-lock.json* ./
COPY --link scripts/fix-node-pty.mjs ./scripts/fix-node-pty.mjs
COPY --link ui/package.json ./ui/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund
COPY --link . .
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

# ---- Stage 3: runtime --------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production \
    CI=false \
    JUNE1815_DATA_DIR=/var/lib/june1815

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        tini \
        ca-certificates \
        python3 \
        build-essential \
 && rm -rf /var/lib/apt/lists/*

# Install the official claude CLI globally so `docker run june1815 gogogo`
# works zero-config. Users can swap this out by building their own image.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g @anthropic-ai/claude-code --no-audit --no-fund \
 && find /usr/local/lib/node_modules -type f -name '*.map' -delete

RUN useradd -m -u 10001 -d /home/june1815 june1815 \
 && mkdir -p /var/lib/june1815 \
 && chown -R june1815:june1815 /var/lib/june1815

USER june1815
WORKDIR /home/june1815/app

COPY --link --from=build --chown=june1815:june1815 /app/dist ./dist
COPY --link --from=build --chown=june1815:june1815 /app/node_modules ./node_modules
COPY --link --from=build --chown=june1815:june1815 /app/package.json ./
COPY --link --from=build --chown=june1815:june1815 /app/june1815.example.yml ./

EXPOSE 7150
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.JUNE1815_PORT||7150)+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--","node","dist/cli/bin.js"]
CMD ["gogogo","--host","0.0.0.0"]
