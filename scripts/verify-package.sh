#!/usr/bin/env sh
set -eu

npm run lint
npm run typecheck
npm test
npm run build
npm pack --dry-run >/dev/null
