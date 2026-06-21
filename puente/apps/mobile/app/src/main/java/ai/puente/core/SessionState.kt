package ai.puente.core

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.encodeToJsonElement

/** State machine de la app (puente/CLAUDE.md §12). */
enum class PuenteSessionState {
    DISCONNECTED,
    CONNECTED_IDLE,
    LISTENING,           // PTT
    PROCESSING,          // llamada al worker
    SPEAKING,            // TTS sonando
    SENTIDO_CONTINUOUS,  // 1 frame / N s
    ESCANEO_LIVE,        // Gemini Live
}

@Serializable
data class ShoppingItem(
    val item: String,
    var status: String = "pending",      // pending | done
    val preferencia: String? = null,
)

/**
 * SessionState que viaja a /agents/super (schemas.md → SessionState).
 * La app es dueña de la lista; Hermes la actualiza y devuelve la versión nueva.
 */
@Serializable
data class SessionState(
    val session_id: String,
    val usuario_id: String,
    val super_id: String,
    var visita_numero: Int = 1,
    val lista_compra: MutableList<ShoppingItem> = mutableListOf(),
    var ubicacion_estimada: String? = null,
    val items_en_carrito: MutableList<String> = mutableListOf(),
    var turno_actual: String? = null,
    var pending_confirm: Boolean = false,
) {
    fun pendientes(): List<ShoppingItem> = lista_compra.filter { it.status == "pending" }

    fun toJson(json: Json): JsonObject =
        json.encodeToJsonElement(serializer(), this) as JsonObject

    companion object {
        fun fromJson(json: Json, obj: JsonObject): SessionState =
            json.decodeFromJsonElement(serializer(), obj)
    }
}
