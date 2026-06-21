# JSON Schemas — Puente

Contratos entre App DAT, Worker y agentes.

---

## SceneJSON (sentido)

```json
{
  "schema_version": "1.0",
  "timestamp": "ISO8601",
  "session_id": "uuid",
  "frame_id": "f_0042",
  "gps": { "lat": 19.39, "lng": -99.17, "accuracy_m": 8 },
  "super_id": "walmart_portales",
  "scene_type": "pasillo",
  "spatial": {
    "adelante": { "label": "pasillo largo", "distancia": "media", "transitable": true },
    "izquierda": { "label": "estantes lacteos", "distancia": "cerca" },
    "derecha": { "label": "estantes cereales", "distancia": "cerca" },
    "alerta": null
  },
  "personas": 2,
  "confianza": 0.82,
  "speech": "Pasillo de lacteos a tu izquierda.",
  "spatial_tags": ["[SPATIAL:izquierda:lacteos:cerca]"]
}
```

---

## ProductJSON (producto super)

```json
{
  "schema_version": "1.0",
  "timestamp": "ISO8601",
  "frame_id": "f_0089",
  "producto": {
    "nombre": "Leche deslactosada",
    "marca": "Lala",
    "presentacion": "1 L",
    "categoria": "lacteos",
    "precio_visible": 34.50,
    "moneda": "MXN"
  },
  "match_lista": {
    "item_buscado": "leche deslactosada",
    "match": true,
    "score": 0.91
  },
  "alternativas_visibles": [{ "marca": "Alpura", "match_parcial": true }],
  "confianza": 0.88,
  "speech": "Es leche Lala deslactosada de un litro. ¿La tomas?"
}
```

---

## SessionState (Hermes)

```json
{
  "session_id": "uuid",
  "usuario_id": "maria_42",
  "super_id": "walmart_portales",
  "visita_numero": 2,
  "lista_compra": [
    { "item": "leche deslactosada", "status": "pending", "preferencia": "Lala" },
    { "item": "pan integral", "status": "pending" },
    { "item": "manzanas", "status": "pending" }
  ],
  "ubicacion_estimada": "pasillo_7_lacteos",
  "items_en_carrito": [],
  "turno_actual": "confirmar_leche",
  "pending_confirm": false,
  "memoria_refs": ["MEMORY:pref_leche_lala", "RAG:layout_super_v1"]
}
```

---

## RAGQueryResponse

```json
{
  "hit": true,
  "confidence": 0.87,
  "skip_vision": true,
  "speech_hint": "Lácteos pasillo 7, a tu izquierda.",
  "chunks": [
    { "collection": "layout_super", "text": "pasillo 7 = lacteos", "score": 0.89 }
  ]
}
```

---

## FusionResponse (unificado worker / módulos)

Contrato común para **sentido**, **producto** y **cruce** (app → TTS / vibración / tonos):

```json
{
  "speech": "string TTS-ready ES-MX",
  "structured": {},
  "spatial_tags": [],
  "alert": false,
  "module": "sentido|producto|cruce"
}
```

| `module` | Contenido de `structured` |
|----------|----------------------------|
| `sentido` | SceneJSON |
| `producto` | ProductJSON |
| `cruce` | CruceJSON |

---

## CruceJSON (módulo cruce peatonal)

Payload nativo de **eyesstreelighttalk** (YOLO), anidado en `FusionResponse.structured`:

```json
{
  "verdict": "NO_CRUZAR",
  "light": "RED",
  "reasons": ["1 vehiculo(s) acercandose pese al rojo"],
  "counts": { "semaforos": 3, "vehiculos": 8, "personas": 0 }
}
```

| `verdict` | Significado |
|-----------|-------------|
| `FACTIBLE_CRUZAR` | Seguro cruzar |
| `PRECAUCION` | Precaución |
| `NO_CRUZAR` | No cruzar |
| `EVALUANDO` | Sin veredicto estable aún |

Mapeo veredicto → salida (ALINEACION_CRUCE.md):

| verdict | `alert` | tono (Hz) |
|---------|---------|-----------|
| `FACTIBLE_CRUZAR` | false | 440 |
| `PRECAUCION` | true | 800 |
| `NO_CRUZAR` | true | 1200 |
| `EVALUANDO` | false | — |

---

## PuenteModule (app móvil)

Enum de módulo activo (una sesión DAT, un módulo a la vez):

```
supermercado | cruce | guia | mac
```

| Módulo | Backend | Caso glassesWatch |
|--------|---------|-------------------|
| `supermercado` | Worker `/fusion`, `/rag`, `/agents/super` | Compras super |
| `cruce` | LAN WS → eyesstreelighttalk | Cruce calle |
| `guia` | Worker `/agents/guide` | Navegación asistida |
| `mac` | LAN `POST /command` myeyescantalk | Puente digital |

---

## FusionResponse (legacy alias)

```json
{
  "speech": "string TTS-ready",
  "structured": {},
  "spatial_tags": [],
  "alert": false,
  "module": "sentido|producto|cruce"
}
```

---

## SPATIAL tag grammar

```
[SPATIAL:derecha:elevador:distancia_media]
[SPATIAL:izquierda:terraza]
[SPATIAL:adelante:escaleras]
[SPATIAL:alerta:vehiculo]
[SPATIAL:none]
```

Strip antes de TTS. Parser regex:

```
\[SPATIAL:(?:none|([a-z]+):([^:\]]+)(?::([^:\]]+))?)\]
```
