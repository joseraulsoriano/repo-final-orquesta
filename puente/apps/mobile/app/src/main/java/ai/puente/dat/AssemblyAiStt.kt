package ai.puente.dat

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONObject
import java.util.concurrent.CountDownLatch

/**
 * STT en streaming con AssemblyAI Universal-3 Pro (spec v3).
 *
 * Auth: token efímero del worker (WorkerClient.transcribeTokenRaw() → {"token":...}),
 * pasado como ?token= en la URL — la key nunca toca el teléfono.
 * Audio: PCM16 mono 16kHz, frames binarios de 50–1000 ms.
 * Cierre: SIEMPRE enviar {"type":"Terminate"} (si no, la sesión sigue facturando).
 */
class AssemblyAiStt(
    tokenJson: String,
    private val http: OkHttpClient,
) {
    private val token = JSONObject(tokenJson).getString("token")
    private var ws: WebSocket? = null
    private val opened = CountDownLatch(1)

    @Volatile var transcript: String = ""; private set
    @Volatile var endOfTurn: Boolean = false; private set
    @Volatile var failed: Boolean = false; private set

    /** Abre el WS y bloquea hasta el Begin (o fallo). */
    fun connect() {
        val url = "wss://streaming.assemblyai.com/v3/ws" +
            "?sample_rate=16000&speech_model=u3-rt-pro&token=$token"
        ws = http.newWebSocket(Request.Builder().url(url).build(), object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) = opened.countDown()

            override fun onMessage(webSocket: WebSocket, text: String) {
                val m = JSONObject(text)
                when (m.optString("type")) {
                    "Turn" -> {
                        val t = m.optString("transcript")
                        if (t.isNotEmpty()) transcript = t          // siempre el texto actual
                        if (m.optBoolean("end_of_turn")) endOfTurn = true
                    }
                    "Termination" -> endOfTurn = true
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failed = true; opened.countDown()
            }
        })
        opened.await()
    }

    /** Envía un chunk PCM16 (50–1000 ms). Más rápido que real-time cierra el socket (3007). */
    fun sendAudio(pcm: ByteArray, len: Int) {
        ws?.send(pcm.copyOf(len).toByteString())
    }

    /** Fuerza fin de turno sin cerrar (útil al soltar el botón PTT). */
    fun forceEndpoint() {
        ws?.send("""{"type":"ForceEndpoint"}""")
    }

    /** Termina la sesión limpiamente y devuelve el transcript final. */
    fun terminate(): String {
        ws?.send("""{"type":"Terminate"}""")
        ws?.close(1000, null)
        return transcript
    }
}
