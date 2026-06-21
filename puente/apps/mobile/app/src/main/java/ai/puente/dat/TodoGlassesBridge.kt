package ai.puente.dat

import ai.puente.net.Gps
import okhttp3.ResponseBody

/**
 * Implementación PENDIENTE de GlassesBridge. Reemplazar por la real del fork de
 * `samples/CameraAccess` (DAT) o una basada en MockDeviceKit (mp4) para dev.
 *
 * Cada método lanza NotImplementedError a propósito: el scaffold de la capa
 * cerebro (WorkerClient + SuperFlow) está completo y probado contra el worker;
 * lo único que falta es enchufar el hardware aquí. Ver INTEGRACION.md.
 */
class TodoGlassesBridge : GlassesBridge {

    override suspend fun captureFrameJpegBase64(): String =
        TODO("DAT: stream.capturePhoto() o último VideoFrame → JPEG 504x896 → base64")

    override fun gps(): Gps? =
        TODO("FusedLocationProviderClient del teléfono → Gps(lat,lng)")

    override suspend fun playTts(audio: ResponseBody) =
        TODO("Reproducir audio.byteStream() en altavoces gafas (HFP / AudioTrack)")

    override fun vibrate(ms: Long) =
        TODO("Vibrator del teléfono para alertas de seguridad")

    override suspend fun listenOnce(): String =
        TODO("Mic → AssemblyAI streaming (token de WorkerClient.transcribeTokenRaw()) → transcript")

    override fun isConnected(): Boolean = false
}
