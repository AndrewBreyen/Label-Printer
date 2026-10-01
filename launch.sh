#!/usr/bin/env bash

set -euo pipefail

case "${1:-}" in
  "")
    ;;
  --quick)
    ;;
  *)
    printf 'Usage: %s [--quick]\n' "$0" >&2
    exit 2
    ;;
esac

if ! command -v npm >/dev/null 2>&1; then
  printf 'Error: npm is required to launch this project.\n' >&2
  exit 1
fi

cd "$(dirname "$0")"

if [[ "${1:-}" != "--quick" ]]; then
  npm install --no-audit --no-fund
fi

(sleep 3; open -a "Google Chrome" http://localhost:3000) &
BROWSER=none npm start 2>&1 | tee
