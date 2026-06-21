#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [[ ! -f Config/Secrets.xcconfig ]]; then
  cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig
  echo "→ Creado Config/Secrets.xcconfig — edítalo con Meta + Worker LAN"
fi

if ! command -v xcodegen >/dev/null; then
  echo "Instala xcodegen: brew install xcodegen"
  exit 1
fi

xcodegen generate
echo "→ Proyecto generado: Puente.xcodeproj"
echo "Abre Puente.xcodeproj, elige tu Team, conecta el iPhone y Run (⌘R)."
echo "Worker: cd puente/backend/worker && npx wrangler dev --ip 0.0.0.0"
