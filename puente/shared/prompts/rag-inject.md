# Prompt — Inyección RAG en fusion

Template para concatenar en system prompt cuando RAG hit.

```
CONTEXTO RAG (confianza {confidence}):
{chunks}

INSTRUCCIONES RAG:
- Si skip_vision=true y confianza > 0.85: responde desde RAG sin describir imagen desde cero.
- Si RAG contradice imagen: prioriza SEGURIDAD de imagen, luego RAG.
- Menciona "ya estuviste aquí" solo en visita 2+.
```

---

## Colecciones RAG

| ID | Contenido |
|----|-----------|
| layout_super | Pasillos, categorías, GPS bbox |
| shelf_snapshots | Embedding + ProductJSON + frame_id |
| productos_usuario | Historial compras |
| session_transcripts | Voz + decisiones |

---

## Reglas skip visión

```
SI query navegación Y layout_super.confianza > 0.85 Y GPS en bbox
  → skip_vision = true

SI frame_hash similar ±5% Y hace < 5s
  → reutilizar JSON previo

SI estante denso Y modo escaneo
  → usar Gemini Live, no batch cada 3s
```
