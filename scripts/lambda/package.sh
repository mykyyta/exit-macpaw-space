#!/usr/bin/env bash
# Build a small Lambda deployment ZIP for the Express API handler.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/.lambda-build"
ZIP_PATH="$OUT_DIR/function.zip"
EDGE_ZIP_PATH="$OUT_DIR/edge-content-sha256.zip"

cd "$ROOT_DIR"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

npx esbuild src/server/lambda.ts \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --outfile="$OUT_DIR/index.mjs"

touch -t 202601010000 "$OUT_DIR/index.mjs"

(
  cd "$OUT_DIR"
  zip -q -X function.zip index.mjs
)

npx esbuild scripts/lambda/edge-content-sha256.cjs \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=cjs \
  --outfile="$OUT_DIR/edge-content-sha256.cjs"

touch -t 202601010000 "$OUT_DIR/edge-content-sha256.cjs"

(
  cd "$OUT_DIR"
  zip -q -X edge-content-sha256.zip edge-content-sha256.cjs
)

echo "Created $ZIP_PATH"
echo "Created $EDGE_ZIP_PATH"
