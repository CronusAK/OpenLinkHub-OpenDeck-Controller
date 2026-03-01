#!/bin/bash
set -euo pipefail

PLUGIN_NAME="com.sfgrimes.fanprofile"
STAGE_DIR="${PLUGIN_NAME}.sdPlugin"

cd "$(dirname "$0")"

VERSION=$(node -e "process.stdout.write(require('./manifest.json').Version)")
OUTPUT="builds/${PLUGIN_NAME}-${VERSION}.streamDeckPlugin"
echo "Version: $VERSION"

echo "Installing dependencies..."
npm install --omit=dev

echo "Packaging plugin..."

rm -rf "$STAGE_DIR"
mkdir "$STAGE_DIR"

cp -r icons node_modules propertyInspector "$STAGE_DIR/"
cp index.js openlinkhub.js manifest.json package.json package-lock.json "$STAGE_DIR/"

rm -f "$OUTPUT"
mkdir -p builds ; zip -r "$OUTPUT" "$STAGE_DIR"

rm -rf "$STAGE_DIR"

echo "Built: $OUTPUT"
ls -lh "$OUTPUT"
