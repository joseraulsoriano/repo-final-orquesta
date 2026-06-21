package ai.puente.net

import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import java.util.concurrent.TimeUnit

/**
 * Cliente HTTP a los endpoints del Cloudflare Worker (los 6 probados).
 * El worker NO expone keys; la app solo habla con él. baseUrl = wrangler dev
 * (http://10.0.2.2:8787 desde el emulador) o la URL .workers.dev en prod.
 *
 * Llamadas bloqueantes: ejecutar en coroutine Dispatchers.IO desde el caller.
 */
class WorkerClient(
    private val baseUrl: String,
    private val http: OkHttpClient = defaultClient(),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = false
        explicitNulls = false
    }
    private val mediaJson = "application/json".toMediaType()

    private inline fun <reified T> postJson(path: String, bodyJson: String): T {
        val req = Request.Builder()
            .url(baseUrl + path)
            .post(bodyJson.toRequestBody(mediaJson))
            .build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) {
                throw WorkerException(path, res.code, text)
            }
            return json.decodeFromString(text)
        }
    }

    /** POST /fusion/describe → SceneJSON | ProductJSON. SLA: sentido ~5s, producto ~4s. */
    fun fusionDescribe(req: FusionRequest): FusionResponse =
        postJson("/fusion/describe", json.encodeToString(FusionRequest.serializer(), req))

    /** POST /rag/query → skip_vision cuando confidence > 0.85 (2da visita). ~ms. */
    fun ragQuery(req: RagQueryRequest): RagQueryResponse =
        postJson("/rag/query", json.encodeToString(RagQueryRequest.serializer(), req))

    /** POST /agents/super → decisión Hermes-lite (confirmar / alternativa / recall). */
    fun agentsSuper(req: AgentsSuperRequest): AgentsSuperResponse =
        postJson("/agents/super", json.encodeToString(AgentsSuperRequest.serializer(), req))

    /** POST /gemini/live-token → token efímero para conectar el WS de Live (Escaneo). */
    fun geminiLiveToken(req: GeminiLiveTokenRequest): GeminiLiveTokenResponse =
        postJson("/gemini/live-token", json.encodeToString(GeminiLiveTokenRequest.serializer(), req))

    /**
     * GET/POST /transcribe-token → token de AssemblyAI streaming (single-use).
     * Devuelve el JSON crudo de AssemblyAI ({ "token": "..." }).
     */
    fun transcribeTokenRaw(): String {
        val req = Request.Builder().url(baseUrl + "/transcribe-token").post(
            ByteArray(0).toRequestBody(null)
        ).build()
        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            if (!res.isSuccessful) throw WorkerException("/transcribe-token", res.code, text)
            return text
        }
    }

    /**
     * POST /tts → audio mp3 en streaming. Devuelve el ResponseBody para que el
     * caller lo reproduzca conforme llega (no esperar el mp3 completo).
     * El worker fuerza model_id=eleven_multilingual_v2 si no se manda.
     * IMPORTANTE: cerrar el ResponseBody al terminar.
     */
    fun ttsStream(text: String): ResponseBody {
        val body = """{"text":${json.encodeToString(kotlinx.serialization.builtins.serializer<String>(), text)}}"""
        val req = Request.Builder()
            .url(baseUrl + "/tts")
            .post(body.toRequestBody(mediaJson))
            .build()
        val res = http.newCall(req).execute()
        if (!res.isSuccessful) {
            val err = res.body?.string().orEmpty()
            res.close()
            throw WorkerException("/tts", res.code, err)
        }
        return res.body ?: throw WorkerException("/tts", res.code, "empty body")
    }

    companion object {
        fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)   // visión puede tardar ~6s
            .writeTimeout(20, TimeUnit.SECONDS)
            .build()
    }
}

class WorkerException(path: String, val code: Int, val bodyText: String) :
    RuntimeException("Worker $path → HTTP $code: ${bodyText.take(300)}")
