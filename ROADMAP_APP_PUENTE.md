# Roadmap App — Puente (Discapacidades) · Gen 2 + Ray-Ban Display

> **Producto:** Plataforma de accesibilidad modular para México/LATAM  
> **Hardware:** Ray-Ban Meta **Gen 2** (audio-first) + Meta Ray-Ban **Display** (audio + HUD)  
> **Principio:** Una app móvil (DAT) = cerebro. Display Web App = segunda pantalla en el lente cuando existe.

---

## 1. Arquitectura dual en una frase

```
                    ┌─────────────────────────────────┐
                    │     BACKEND (Fusion + Agentes)   │
                    │  vision · audio · olfato · HRV   │
                    └───────────────┬─────────────────┘
                                    │ HTTPS / WS
          ┌─────────────────────────┼─────────────────────────┐
          │                         │                         │
┌─────────▼─────────┐     ┌─────────▼─────────┐     ┌────────▼────────┐
│  APP MÓVIL (DAT)  │     │  COMPANION WEB    │     │  DISPLAY WEB    │
│  Android / iOS    │     │  (opcional jurado)│     │  600×600 HTTPS  │
│  ★ CEREBRO ★      │     │  M1 GlassesView   │     │  solo Display   │
└─────────┬─────────┘     └───────────────────┘     └────────┬────────┘
          │ DAT session                                       │ Meta AI
          │ cámara · mic · speakers                           │ carga URL
          ▼                                                   ▼
   ┌──────────────┐                                    ┌──────────────┐
   │  Gen 2       │                                    │  Display     │
   │  sin HUD     │                                    │  + Neural    │
   │  audio out   │                                    │  Band        │
   └──────────────┘                                    └──────────────┘
```

**Regla:** Todo lo pesado (IA, agentes, WhatsApp) vive en **teléfono + backend**.  
**Gen 2** = salida por **altavoces**.  
**Display** = misma lógica + **HUD** en lente (captions, confirmaciones, última instrucción).

---

## 2. Qué hace cada dispositivo (matriz hardware)

| Capacidad | Gen 2 | Ray-Ban Display | Quién implementa |
|-----------|-------|-----------------|------------------|
| Cámara POV stream | Sí (DAT) | Sí (DAT, **no** Web App) | App móvil DAT |
| Micrófono | Sí (HFP 8kHz) | Sí (DAT) | App móvil DAT |
| Altavoces / TTS | Sí | Sí | App móvil DAT |
| Pantalla en lente | **No** | Sí 600×600 | Display Web App o MWDATDisplay |
| Neural Band (gestos) | No | Sí | Display Web App (arrow keys) |
| IMU / brújula | No expuesto directo | Sí (Web API) | Display Web App |
| GPS | Teléfono | Teléfono vía Web App | Ambos |
| Meta AI nativo | Sí | Sí | Baseline comparación |
| Developer Mode | Sí | Sí | Meta AI app |

Fuente Display Web Apps: [build guide](https://wearables.developer.meta.com/docs/develop/webapps/build/) — sin cámara, sin mic, sin text input.

---

## 3. Módulos × dispositivo × prioridad

| Módulo | Discapacidad | Gen 2 | Display | Canal salida Gen 2 | Canal salida Display |
|--------|--------------|-------|---------|--------------------|-----------------------|
| **Sentido** | Visual | ✅ Core | ✅ Core | TTS altavoces | TTS + HUD texto última frase |
| **Puente** | Motriz / comunicación | ✅ Core | ✅ Core | TTS + confirmación voz | HUD "Saludo enviado a Ángel ✓" |
| **Mano** | Destreza | ✅ v1 | ✅ v1 | Dictado voz | HUD preview texto + D-pad confirmar |
| **Oído+** | Auditiva | ⚠️ parcial | ✅ **mejor** | Vibración teléfono | **Captions en lente** |
| **Voz** | Mudez | ✅ v1 | ✅ v1 | TTS altavoces | HUD lo que "dirás" + TTS |
| **Calma** | Cognición | ✅ v2 | ✅ v2 | Respuestas cortas voz | HUD modo minimal |

**Conclusión estrategia dual:**
- **Gen 2** = MVP y demo con **audio** (tienes este hardware).
- **Display** = diferenciador para **sordos**, **baja visión parcial** (texto grande en lente), **confirmaciones visuales** sin sacar teléfono.
- **Misma app DAT** detecta modelo de gafas y activa o no el HUD.

---

## 4. Stack técnico recomendado

```
puente/
├── apps/
│   ├── mobile/                 # ★ PRINCIPAL — Kotlin (Android) o Swift (iOS)
│   │   ├── dat/                # Session, stream, mic, speakers
│   │   ├── modules/            # sentido, puente, mano, oido, voz
│   │   └── companion/          # UI teléfono (settings, jurado)
│   │
│   ├── display-hud/            # Web App 600×600 — Vite + vanilla/React
│   │   └── deploy → Vercel HTTPS
│   │
│   └── companion-web/          # Reuso M1 GlassesView (React) — laptop/jurado
│
├── backend/                    # Bun/Node o Python FastAPI
│   ├── fusion/                 # POST /describe multimodal
│   ├── agents/                 # Puente, Mano, Sentido prompts
│   └── ws/                     # Sync HUD + companion-web
│
└── shared/
    ├── prompts/                # ES-MX por módulo
    └── types/                  # FusionRequest, HudPayload
```

| Pieza | Tecnología | Por qué |
|-------|------------|---------|
| App móvil | **Android Kotlin + DAT 0.7** | Docs oficiales, MockDeviceKit, Gen 2 |
| iOS (fase 2) | Swift + DAT iOS | Paridad |
| RN (alternativa) | [expo-meta-wearables-dat](https://github.com/circus-kitchens/expo-meta-wearables-dat) | Si el equipo es TS-first |
| Display HUD | **Vite + TS**, [meta-wearables-webapp](https://github.com/facebookincubator/meta-wearables-webapp) skills | 600×600, D-pad |
| Backend | Bun (reuso `/Users/chasse/hack`) o FastAPI | Fusion API |
| IA | OpenAI GPT-4o mini / Gemini Flash | Vision + agentes |
| TTS | Android TTS → altavoces gafas; ElevenLabs opcional | Latencia |
| Puente social | WhatsApp Business API / share intent | "Saluda a Ángel" |

---

## 5. Flujos por módulo (cómo funciona en cada gafa)

### 5.1 Sentido (orientación espacial)

```
[Gen 2 y Display — idéntico en cerebro]

DAT stream MEDIUM @ 15fps
  → cada 3s: frame → backend /fusion/describe
  → respuesta: { adelante, izquierda, derecha, alerta }
  → TTS → altavoces gafas

[Display extra]
  → WS → display-hud: muestra última línea en HUD (texto grande, alto contraste)
  → Usuario baja visión parcial: lee lente + oye

[Gen 2 solo]
  → Solo audio (usuario ciego: perfecto)
```

### 5.2 Puente ("Saluda a mi amigo Ángel")

```
Voz: "Saluda a mi amigo Ángel"
  → STT (mic gafas)
  → Agente Puente:
      1. frame actual → ¿persona/presencia?
      2. lookup contacto Ángel
      3. acción: WhatsApp | SMS | audio TTS audible

[Gen 2]
  → "Le envié saludo a Ángel por WhatsApp" (voz)

[Display]
  → HUD: "✓ Saludo enviado a Ángel"
  → D-pad: Enter = confirmar antes de enviar (modo accesible)
```

### 5.3 Mano (documentos sin tocar pantalla)

```
Voz: "Dicta correo al doctor"
  → Agente escucha → genera borrador
  → Lee borrador en voz alta

[Gen 2]
  → "¿Lo envío?" → "Sí" → envía

[Display]
  → HUD muestra borrador scroll D-pad
  → Enter confirma envío
```

### 5.4 Oído+ (sordos — Display gana)

```
Mic ambiente → Whisper → texto conversación ajena

[Gen 2 — débil]
  → Solo teléfono muestra captions (usuario debe mirar teléfono)

[Display — fuerte]
  → HUD live captions en lente ([similar Meta Live Captions](https://www.meta.com/ai-glasses/accessibility/))
  → Diferenciador vs Gen 2
```

---

## 6. Comunicación App móvil ↔ Display HUD

Web App **no tiene cámara**. Sync vía backend WebSocket:

```typescript
// backend → display-hud (WS)
interface HudPayload {
  mode: "sentido" | "puente" | "mano" | "oido" | "voz";
  line1: string;           // max ~40 chars
  line2?: string;
  alert?: boolean;         // rojo / prioridad
  actions?: { label: string; id: string }[];  // D-pad focusable
  timestamp: number;
}

// display-hud → backend (Enter on action)
{ actionId: "confirm_send", sessionId: "..." }
```

**Polling fallback:** HUD hace `GET /hud/state` cada 2s si WS falla.

**Gen 2 sin Display:** app móvil ignora `HudPayload`; solo TTS.

---

## 7. Detección de hardware en app móvil

```kotlin
enum class GlassesProfile {
    GEN2_AUDIO_ONLY,    // Ray-Ban Meta sin display
    DISPLAY_WITH_HUD,   // Ray-Ban Display → activar sync HUD
    UNKNOWN
}

// Tras DAT device discovery:
fun profileFor(device: Device): GlassesProfile =
    when {
        device.hasDisplayCapability() -> DISPLAY_WITH_HUD
        else -> GEN2_AUDIO_ONLY
    }
```

| Profile | UI teléfono | HUD Web App | TTS |
|---------|---------------|-------------|-----|
| GEN2 | Minimal (status) | No cargar | Siempre |
| DISPLAY | Status + link HUD | Push WS | Siempre + HUD |

---

## 8. Roadmap por fases

### Fase 0 — Setup (2–3 días) · BLOQUEANTE

| # | Tarea | Gen 2 | Display | Entregable |
|---|-------|-------|---------|------------|
| 0.1 | Cuenta Wearables Developer Center | ✅ | ✅ | App ID |
| 0.2 | Developer Mode Meta AI | ✅ | ✅ | — |
| 0.3 | Clonar DAT Android sample + MockDeviceKit | ✅ | ✅ | 1 frame log |
| 0.4 | Primera sesión real Gen 2 | ✅ | — | Foto en log |
| 0.5 | Registrar Display Web App URL (Vercel) | — | ✅ | HUD "Hola" |
| 0.6 | Backend `/health` + `/fusion/describe` stub | ✅ | ✅ | curl OK |

### Fase 1 — MVP Hackathon (4–5 días) · DEMO

| # | Feature | Gen 2 | Display | Módulo |
|---|---------|-------|---------|--------|
| 1.1 | Stream → vision → TTS espacial ES | ✅ | ✅ + HUD | Sentido |
| 1.2 | "¿Qué hay a mi derecha?" (voz) | ✅ | ✅ | Sentido |
| 1.3 | "Saluda a [contacto]" → WhatsApp/share | ✅ | ✅ + confirm HUD | Puente |
| 1.4 | Companion web POV (reuso M1) | ✅ | ✅ | Jurado |
| 1.5 | Mock olfato en prompt (demo) | ✅ | ✅ | Fusion |
| 1.6 | Perfil discapacidad en onboarding | ✅ | ✅ | UX |

**Demo mínima vendible:** Gen 2 en vivo + laptop companion. Display HUD si tienen unidad.

### Fase 2 — v1 Producto (2–3 semanas)

| # | Feature | Gen 2 | Display |
|---|---------|-------|---------|
| 2.1 | Mano: dictado email/documento | ✅ | ✅ HUD preview |
| 2.2 | Voz: TTS para usuarios mudos | ✅ | ✅ |
| 2.3 | Oído+: captions stream → HUD | ⚠️ teléfono | ✅ **lente** |
| 2.4 | Contactos / agenda Puente | ✅ | ✅ |
| 2.5 | iOS DAT paridad | ✅ | ✅ |
| 2.6 | Modo offline OCR básico | ✅ | ✅ |
| 2.7 | Español MX prompts tuning | ✅ | ✅ |

### Fase 3 — v2 Escala LATAM (1–2 meses)

| # | Feature | Notas |
|---|---------|-------|
| 3.1 | Google Health HRV → Calma | Interocepción |
| 3.2 | ESP32 olfato BLE | Sensor real |
| 3.3 | Institucional DIF/IMSS pitch | B2G |
| 3.4 | Neural Band gestures (Display) | Confirm sin voz |
| 3.5 | Memoria ruta / historial | Cognición |
| 3.6 | Publicación DAT release channel | Meta Developer Center |

---

## 9. Pantallas / superficies de la app

### 9.1 App móvil (DAT) — pantallas

| Pantalla | Gen 2 | Display |
|----------|-------|---------|
| Onboarding + perfil discapacidad | ✅ | ✅ |
| Permisos (Meta AI deeplink cámara) | ✅ | ✅ |
| Sesión activa (minimal) | ✅ | ✅ |
| Selector módulo (Sentido/Puente/Mano) | ✅ | ✅ |
| Ajustes (idioma, velocidad TTS) | ✅ | ✅ |
| Link "Abrir HUD" | oculto | ✅ |
| Companion debug (dev) | ✅ | ✅ |

### 9.2 Display Web App (600×600)

| Vista | D-pad | Uso |
|-------|-------|-----|
| **Idle** | — | Logo + "Conectado" |
| **Live line** | — | Última narración Sentido |
| **Alert** | Enter ack | Cruce / peligro |
| **Puente confirm** | Enter / Esc | Antes de enviar WhatsApp |
| **Mano preview** | ↑↓ scroll | Borrador email |
| **Captions** | — | Oído+ scroll automático |

CSS: fondo `#000`, texto `#FFF`, `.focusable` min 88px ([Meta guidelines](https://wearables.developer.meta.com/docs/develop/webapps/build/)).

### 9.3 Companion web (laptop — jurado)

Reuso `GlassesView` de `/Users/chasse/hack/M1/metaintegration`:
- POV stream vía WebSocket
- No necesario para usuario final
- Gen 2 y Display igual

---

## 10. Onboarding: perfil de discapacidad

Al instalar, usuario elige **dominios** (multi-select Washington Group):

```
¿Qué apoyo necesitas? (puedes elegir varios)
[ ] Orientación espacial (ver / caminar)
[ ] Usar sin manos (escribir, saludar)
[ ] Escuchar conversaciones (oír)
[ ] Hablar (comunicarme)
[ ] Menos información cuando estoy saturado

→ Activa módulos: Sentido, Puente+Mano, Oído+, Voz, Calma
→ Gen 2: ajusta defaults (ej. sordo → sugerir Display si disponible)
```

---

## 11. Equipo y paralelización

| Rol | Fase 1 | Entrega |
|-----|--------|---------|
| **Mobile (Android DAT)** | Stream, STT, TTS, sesión | App cerebro |
| **Backend** | /fusion, /agents/puente, WS | API |
| **Display HUD** | Web App Vercel + D-pad | Solo si hay Display |
| **Frontend companion** | Adaptar M1 GlassesView | Jurado |
| **Prompts/UX** | ES-MX, disclaimers | Copy accesible |
| **Demo/pitch** | Guion 3 actos | Hackathon |

**Sin Display en equipo:** Fase 1 **100% viable solo Gen 2**. HUD = Fase 2 cuando consigan unidad.

---

## 12. Riesgos por plataforma

| Riesgo | Gen 2 | Display | Mitigación |
|--------|-------|---------|------------|
| Solo audio para sordos | Alto | Bajo | Pitch: "Display = captions en lente" |
| BT latencia visión | Alto | Alto | Sample 1 frame/3s |
| Web App sin mic | — | Alto | Mic siempre vía DAT móvil |
| Dos codebases | Medio | Medio | Shared types + backend único |
| Costo Display $799 | — | Medio | Gen 2 MVP primero |

---

## 13. Definition of Done — Fase 1 (hackathon)

- [ ] App Android DAT: sesión Gen 2 real ≥5 min
- [ ] Sentido: narración espacial ES por altavoces
- [ ] Puente: "Saluda a Ángel" → mensaje enviado
- [ ] Backend fusion operativo
- [ ] Companion web muestra POV
- [ ] (Opcional Display) HUD recibe WS y muestra última línea
- [ ] Disclaimer accesibilidad en app
- [ ] Demo script 3 min probado

---

## 14. Próximo paso inmediato

1. **Crear repo `puente/`** con carpetas `apps/mobile`, `apps/display-hud`, `backend`
2. **Fork DAT Android sample** → renombrar package `com.puente.app`
3. **Backend stub** `/fusion/describe` (reuso stack Bun de hack)
4. **Display HUD** hello world en Vercel con `mrbd-web-app-capable`
5. **Conectar** WS HUD solo si `GlassesProfile.DISPLAY`

---

## 15. Referencias cruzadas

- [MODULO_DISCAPACIDADES_MX_LATAM.md](./MODULO_DISCAPACIDADES_MX_LATAM.md) — personas, mercado
- [CAMARA_META_RAYBAN.md](./CAMARA_META_RAYBAN.md) — pipeline cámara
- [INVESTIGACION_META_SDK.md](./INVESTIGACION_META_SDK.md) — DAT vs Web Apps
- [DAT Android](https://github.com/facebook/meta-wearables-dat-android)
- [Display Web Apps toolkit](https://github.com/facebookincubator/meta-wearables-webapp)
- [Meta Accessibility](https://www.meta.com/ai-glasses/accessibility/)
