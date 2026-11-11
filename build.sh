#!/bin/bash
# Stackbound build script.
#   ./build.sh            dev server at http://localhost:8820
#   ./build.sh test       type check + rules engine tests + AI self-play
#   ./build.sh build      production build into dist/
#   ./build.sh deploy     build, then deploy dist/ to Cloudflare Workers (https://stackbound.rennko.tech)
set -euo pipefail
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
case "${1:-dev}" in
  dev) npx vite --port 8820 ;;
  test) npx tsc --noEmit && npx vitest run ;;
  build) npx tsc --noEmit && npx vite build ;;
  deploy) npx tsc --noEmit && npx vite build && npx -y wrangler@4 deploy ;;
  *) sed -n '2,6p' "$0"; exit 1 ;;
esac
