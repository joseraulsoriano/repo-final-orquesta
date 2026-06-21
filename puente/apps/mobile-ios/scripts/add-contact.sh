#!/usr/bin/env bash
# Añade un contacto para Puente Caras (reconocimiento de personas).
# Uso: ./scripts/add-contact.sh "Andrea" "amiga" ~/Downloads/andrea.jpg
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTACTS_DIR="$ROOT/Puente/Contacts"
MANIFEST="$CONTACTS_DIR/contacts.json"

NAME="${1:?Falta nombre (ej. Andrea)}"
RELATION="${2:-amigo/a}"
SRC="${3:?Falta ruta a foto JPEG}"

if [[ ! -f "$SRC" ]]; then
  echo "No existe: $SRC" >&2
  exit 1
fi

mkdir -p "$CONTACTS_DIR"
SLUG="$(echo "$NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]' | head -c 24)"
DEST="$CONTACTS_DIR/${SLUG}.jpg"
cp "$SRC" "$DEST"

python3 - "$MANIFEST" "$NAME" "$RELATION" "$(basename "$DEST")" <<'PY'
import json, sys
path, name, relation, photo = sys.argv[1:5]
try:
    with open(path) as f:
        data = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    data = []
if not isinstance(data, list):
    data = []
data = [e for e in data if e.get("name", "").lower() != name.lower()]
data.append({"name": name, "relation": relation, "photo": photo})
with open(path, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
print(f"Manifest: {len(data)} contacto(s)")
PY

"$ROOT/scripts/generate-contacts-swift.sh"
echo "Listo: $NAME → $DEST"
echo "Recompila la app en Xcode para embeber la foto."
