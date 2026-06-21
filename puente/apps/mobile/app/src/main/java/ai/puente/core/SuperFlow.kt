package ai.puente.core

import ai.puente.dat.GlassesBridge
import ai.puente.net.AgentsSuperRequest
import ai.puente.net.FusionRequest
import ai.puente.net.RagQueryRequest
import ai.puente.net.WorkerClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/**
 * Orquestador del flujo super (FLUJO_SUPER_PERSONA_CIEGA.md).
 *
 * Los "3 escenarios" NO son ramas distintas de código: emergen del estado de RAG
 * y de `visita_numero`. El mismo motor produce los tres:
 *   • 1ra visita  → RAG miss  → visión obligatoria (e indexar al cerrar)
 *   • 2da visita  → RAG hit    → skip_vision, respuesta en <1s
 *   • Experta+gafas → idéntico motor; el contraste es de UX (tacto vs PTT), no de código
 *
 * Cada método es un turno completo: percibe → decide (worker) → habla (TTS gafas).
 * Ejecutar desde una coroutine; las llamadas de red van a Dispatchers.IO.
 */
class SuperFlow(
    private val worker: WorkerClient,
    private val glasses: GlassesBridge,
    private val state: SessionState,
    private val userMd: String,
    private val memoryMd: String,
    private val onState: (PuenteSessionState) -> Unit = {},
    private val onSpeech: (String) -> Unit = {},   // log / companion jurado
) {
    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    /** Punto de entrada PTT: escucha, enruta intención, responde. */
    suspend fun handlePtt() {
        onState(PuenteSessionState.LISTENING)
        val transcript = glasses.listenOnce().trim()
        if (transcript.isEmpty()) return
        when (intentOf(transcript)) {
            Intent.WHERE -> navigate(transcript)
            Intent.WHAT_IS -> confirmProduct(transcript)
            Intent.WHATS_LEFT -> recall(transcript)
            Intent.YES, Intent.NO -> resolveConfirm(transcript)
            Intent.UNKNOWN -> recall(transcript) // fallback: que Hermes decida
        }
    }

    /** "¿Dónde está la leche?" — RAG primero; visión solo si RAG no sabe. */
    suspend fun navigate(transcript: String) = withContext(Dispatchers.IO) {
        onState(PuenteSessionState.PROCESSING)
        val rag = worker.ragQuery(
            RagQueryRequest(query = transcript, gps = glasses.gps(), superId = state.super_id)
        )
        if (rag.hit && rag.skipVision) {
            // 2da visita: respuesta desde memoria, sin gastar visión.
            state.ubicacion_estimada = rag.chunks.firstOrNull()?.text
            speak(rag.speechHint)
            return@withContext
        }
        // 1ra visita / super no indexado: visión obligatoria.
        val frame = glasses.captureFrameJpegBase64()
        val fusion = worker.fusionDescribe(
            FusionRequest(
                imageBase64 = frame,
                module = "sentido",
                transcript = transcript,
                ragContext = if (rag.hit) rag.speechHint else null,
                gps = glasses.gps(),
                superId = state.super_id,
                sessionId = state.session_id,
                frameId = "f_${System.currentTimeMillis()}",
            )
        )
        if (fusion.alert) glasses.vibrate(300)
        speak(fusion.speech)
        // TODO Fase 4: indexar shelf_snapshots/layout para la próxima visita.
    }

    /** "¿Qué producto es este?" — foto → ProductJSON → Hermes confirma. */
    suspend fun confirmProduct(transcript: String) = withContext(Dispatchers.IO) {
        onState(PuenteSessionState.PROCESSING)
        val target = state.pendientes().firstOrNull()
        val frame = glasses.captureFrameJpegBase64()
        val fusion = worker.fusionDescribe(
            FusionRequest(
                imageBase64 = frame,
                module = "producto",
                transcript = transcript,
                itemBuscado = target?.item,
                marcaPreferida = target?.preferencia,
                gps = glasses.gps(),
                superId = state.super_id,
                sessionId = state.session_id,
                frameId = "f_${System.currentTimeMillis()}",
            )
        )
        // Hermes decide: match / alternativa / pedir confirmación.
        val decision = worker.agentsSuper(
            AgentsSuperRequest(
                transcript = transcript,
                structured = fusion.structured,
                sessionState = state.toJson(json),
                action = "confirm",
                userMd = userMd,
                memoryMd = memoryMd,
            )
        )
        applyDecision(decision.sessionState, decision.pendingConfirm)
        speak(decision.speech)
    }

    /** "¿Qué me falta?" — Hermes lee la lista pendiente. */
    suspend fun recall(transcript: String) = withContext(Dispatchers.IO) {
        onState(PuenteSessionState.PROCESSING)
        val decision = worker.agentsSuper(
            AgentsSuperRequest(
                transcript = transcript,
                sessionState = state.toJson(json),
                action = "recall",
                userMd = userMd,
                memoryMd = memoryMd,
            )
        )
        applyDecision(decision.sessionState, decision.pendingConfirm)
        speak(decision.speech)
    }

    /** "sí"/"no" tras una confirmación pendiente (marcar comprado). */
    private suspend fun resolveConfirm(transcript: String) = withContext(Dispatchers.IO) {
        onState(PuenteSessionState.PROCESSING)
        val decision = worker.agentsSuper(
            AgentsSuperRequest(
                transcript = transcript,
                sessionState = state.toJson(json),
                action = "confirm",
                userMd = userMd,
                memoryMd = memoryMd,
            )
        )
        applyDecision(decision.sessionState, decision.pendingConfirm)
        speak(decision.speech)
    }

    private fun applyDecision(newState: kotlinx.serialization.json.JsonObject, pending: Boolean) {
        val updated = SessionState.fromJson(json, newState)
        state.lista_compra.clear(); state.lista_compra.addAll(updated.lista_compra)
        state.items_en_carrito.clear(); state.items_en_carrito.addAll(updated.items_en_carrito)
        state.ubicacion_estimada = updated.ubicacion_estimada
        state.turno_actual = updated.turno_actual
        state.pending_confirm = pending
    }

    private suspend fun speak(text: String) {
        if (text.isBlank()) return
        onSpeech(text)
        onState(PuenteSessionState.SPEAKING)
        worker.ttsStream(text).use { glasses.playTts(it) }
        onState(PuenteSessionState.CONNECTED_IDLE)
    }

    private enum class Intent { WHERE, WHAT_IS, WHATS_LEFT, YES, NO, UNKNOWN }

    private fun intentOf(t: String): Intent {
        val s = t.lowercase()
        return when {
            Regex("\\b(s[ií]|claro|d[aá]le|t[oó]malo)\\b").containsMatchIn(s) -> Intent.YES
            Regex("\\bno\\b").containsMatchIn(s) -> Intent.NO
            s.contains("falta") || s.contains("qué llevo") || s.contains("que llevo") -> Intent.WHATS_LEFT
            s.contains("dónde") || s.contains("donde") -> Intent.WHERE
            s.contains("qué es") || s.contains("que es") || s.contains("qué producto") ||
                s.contains("este") || s.contains("esto") -> Intent.WHAT_IS
            else -> Intent.UNKNOWN
        }
    }
}
