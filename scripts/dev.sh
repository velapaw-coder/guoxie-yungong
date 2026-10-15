#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p apps/web/out
npm --prefix apps/api run dev &
api_pid=$!
npm --prefix apps/web run dev &
web_pid=$!
trap 'kill "$api_pid" "$web_pid" 2>/dev/null || true' EXIT
wait
