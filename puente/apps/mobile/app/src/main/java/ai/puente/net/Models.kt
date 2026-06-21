package ai.puente.net

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Contratos JSON entre la app DAT y el Cloudflare Worker.
 * Espejo de puente/shared/types/schemas.md — mantener en sync con el worker.
 *
 * `structured` se deja como JsonObject crudo (SceneJSON | ProductJSON) porque
 * su forma depende del módulo; la app consume `speech`/`alert`/`spatial_tags`.
 */

@Serializable
data class Gps(
    val lat: Double,
    val lng: Double,
    @SerialName("accuracy_m") val accuracyM: Int? = null,
)

// ---------- /fusion/describe ----------

@Serializable
data class FusionRequest(
    @SerialName("image_base64") val imageBase64: String,
    val module: String,                 // "sentido" | "producto"
    val transcript: String? = null,
    val continuous: Boolean? = null,
    val locale: String? = "es-MX",
    @SerialName("rag_context") val ragContext: String? = null,
    // producto:
    @SerialName("item_buscado") val itemBuscado: String? = null,
    @SerialName("marca_preferida") val marcaPreferida: String? = null,
    // metadata del teléfono (el modelo no la inventa):
    val gps: Gps? = null,
    val timestamp: String? = null,
    @SerialName("session_id") val sessionId: String? = null,
    @SerialName("super_id") val superId: String? = null,
    @SerialName("frame_id") val frameId: String? = null,
)

@Serializable
data class FusionResponse(
    val speech: String,
    val structured: JsonObject,
    @SerialName("spatial_tags") val spatialTags: List<String> = emptyList(),
    val alert: Boolean = false,
    val module: String,
)

// ---------- /rag/query ----------

@Serializable
data class RagQueryRequest(
    val query: String,
    val gps: Gps? = null,
    @SerialName("super_id") val superId: String? = null,
)

@Serializable
data class RagChunk(
    val collection: String,
    val text: String,
    val score: Double,
)

@Serializable
data class RagQueryResponse(
    val hit: Boolean,
    val confidence: Double,
    @SerialName("skip_vision") val skipVision: Boolean,
    @SerialName("speech_hint") val speechHint: String,
    val chunks: List<RagChunk> = emptyList(),
)

// ---------- /agents/super ----------

@Serializable
data class AgentsSuperRequest(
    val transcript: String? = null,
    val structured: JsonElement? = null,
    @SerialName("session_state") val sessionState: JsonElement? = null,
    val action: String? = null,         // "confirm" | "alternativa" | "recall"
    @SerialName("user_md") val userMd: String? = null,
    @SerialName("memory_md") val memoryMd: String? = null,
)

@Serializable
data class AgentsSuperResponse(
    val speech: String,
    @SerialName("session_state") val sessionState: JsonObject,
    @SerialName("pending_confirm") val pendingConfirm: Boolean = false,
    val action: String = "IDLE",
    @SerialName("memory_ops") val memoryOps: List<JsonElement> = emptyList(),
)

// ---------- /gemini/live-token (modo Escaneo) ----------

@Serializable
data class GeminiLiveTokenRequest(
    @SerialName("items_pendientes") val itemsPendientes: List<String> = emptyList(),
    @SerialName("rag_context") val ragContext: String? = null,
    val locale: String? = "es-MX",
)

@Serializable
data class GeminiLiveTokenResponse(
    val token: String,
    @SerialName("ws_url") val wsUrl: String,
    val model: String,
)
