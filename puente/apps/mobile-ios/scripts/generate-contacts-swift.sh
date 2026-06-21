#!/usr/bin/env bash
# Regenera ContactPhotos.generated.swift desde Puente/Contacts/contacts.json + JPEGs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONTACTS_DIR="$ROOT/Puente/Contacts"
MANIFEST="$CONTACTS_DIR/contacts.json"
OUT="$ROOT/Puente/Config/ContactPhotos.generated.swift"

python3 - "$MANIFEST" "$CONTACTS_DIR" "$OUT" <<'PY'
import json, base64, sys, os

manifest_path, contacts_dir, out_path = sys.argv[1:4]
entries = []
try:
    with open(manifest_path) as f:
        entries = json.load(f)
except (FileNotFoundError, json.JSONDecodeError):
    entries = []

lines = [
    "// Generado por scripts/generate-contacts-swift.sh — no editar a mano.",
    "// Añade fotos: ./scripts/add-contact.sh \"Nombre\" \"relación\" ruta/foto.jpg",
    "",
    "import Foundation",
    "",
    "enum DemoContacts {",
    "    static let all: [RecognizeContactRef] = [",
]

for e in entries:
    name = e.get("name", "").replace("\\", "\\\\").replace('"', '\\"')
    relation = (e.get("relation") or "").replace("\\", "\\\\").replace('"', '\\"')
    photo = e.get("photo", "")
    photo_path = os.path.join(contacts_dir, photo)
    if not os.path.isfile(photo_path):
        print(f"warn: falta {photo_path}", file=sys.stderr)
        continue
    with open(photo_path, "rb") as img:
        b64 = base64.b64encode(img.read()).decode("ascii")
    rel_part = f', relation: "{relation}"' if relation else ""
    lines.append(f'        RecognizeContactRef(name: "{name}"{rel_part}, imageBase64: "{b64}"),')

lines.extend([
    "    ]",
    "}",
    "",
])

with open(out_path, "w") as f:
    f.write("\n".join(lines))

print(f"Escrito {out_path} ({len(entries)} entrada(s) en manifest)")
PY
