#!/usr/bin/env bash
# Verifica que el iPhone pueda alcanzar worker/cruce/Mac antes de probar con gafas.
set -euo pipefail

IP="${1:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "")}"
if [[ -z "$IP" ]]; then
  echo "No se detectó IP LAN. Pasa la IP: $0 192.168.x.x"
  exit 1
fi

echo "=== Puente — verificación LAN ($IP) ==="
echo ""
echo "Actualiza Secrets.xcconfig si la IP cambió:"
echo "  PUENTE_WORKER_BASE_URL = http://$IP:8787"
echo "  PUENTE_COMMAND_BASE_URL = http://$IP:8788"
echo "  PUENTE_CROSSING_WS_URL = ws://$IP:8765"
echo ""

check() {
  local name="$1" url="$2"
  if curl -sf -m 5 "$url" >/dev/null 2>&1; then
    echo "OK  $name  $url"
  else
    echo "FAIL $name  $url"
    return 1
  fi
}

FAIL=0
check "Worker /health" "http://$IP:8787/health" || FAIL=1
check "Worker TTS" "http://127.0.0.1:8787/health" || true
# cruce y Mac son opcionales según módulo
if curl -sf -m 2 "http://$IP:8788/health" >/dev/null 2>&1; then
  echo "OK  Mac commands :8788"
else
  echo "SKIP Mac :8788 (solo modo Mac)"
fi

echo ""
if [[ "$FAIL" -eq 0 ]]; then
  echo "Prueba en Safari del iPhone: http://$IP:8787/health"
  echo "Luego: Xcode → iPhone físico → Run Puente"
else
  echo "Arranca el worker: cd puente/backend/worker && npx wrangler dev --ip 0.0.0.0"
  exit 1
fi
