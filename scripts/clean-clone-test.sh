#!/usr/bin/env bash
# Clone the repo into a fresh directory, install, and run the offline demo smoke.
# Usage: bash scripts/clean-clone-test.sh [repo-path-or-url]
set -euo pipefail

SOURCE="${1:-$(pwd)}"
TARGET="$(mktemp -d 2>/dev/null || mktemp -d -t airbag-clean-clone)"
echo "Clean clone: $SOURCE -> $TARGET"

git clone --depth 1 "$SOURCE" "$TARGET/repo"
cd "$TARGET/repo"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

pnpm install --frozen-lockfile
pnpm demo --smoke

if [ -n "$(git status --short)" ]; then
  echo "Clean-clone test failed: the build dirtied tracked files:"
  git status --short
  exit 1
fi

echo "Clean-clone test passed in $TARGET/repo"
