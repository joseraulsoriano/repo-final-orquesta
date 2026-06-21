package ai.puente.dat

import ai.puente.net.Gps
import okhttp3.ResponseBody

/**
 * Frontera con el hardware Gen 2 vía DAT. TODO lo específico de Meta vive
 * detrás de esta interfaz; el orquestador (SuperFlow) solo conoce esto.
 *
 * Implementar en el fork de `samples/CameraAccess` (meta-wearables-dat-android):
 * la implementación real usa Wearables.createSession(), stream.capturePhoto(),
 * mic HFP, y playback HFP. Ver INTEGRACION.md.
 *
 * Para desarrollo sin gafas: una impl con MockDeviceKit (frames desde un mp4 de
 * super) cumple este mismo contrato → el flujo completo es testeable sin Gen 2.
 */
interface GlassesBridge {

    /**
     * Frame POV actual como JPEG base64 (sin prefijo data:). En real:
     * stream.capturePhoto() o el último VideoFrame decodificado a JPEG.
     * Debe entregar ~504x896 (DAT MEDIUM) para cumplir el SLA de visión.
     */
    suspend fun captureFrameJpegBase64(): String

    /** GPS aproximado del TELÉFONO (no de las gafas). null si no disponible. */
    fun gps(): Gps?

    /**
     * Reproduce audio TTS en los altavoces de las gafas (HFP), consumiendo el
     * stream conforme llega (first-byte ~0.6s). Bloqueante hasta fin de audio.
     * El caller cierra el ResponseBody.
     */
    suspend fun playTts(audio: ResponseBody)

    /** Vibración del teléfono para alertas de seguridad (<2s, FLUJO §9). */
    fun vibrate(ms: Long)

    /**
     * PTT: abre el mic, transcribe vía AssemblyAI streaming (usando el token
     * de WorkerClient.transcribeTokenRaw()) y devuelve el transcript final
     * cuando el usuario suelta el botón / hay fin de turno.
     */
    suspend fun listenOnce(): String

    /** Estado de la sesión DAT (para la state machine / UI de 4 pantallas). */
    fun isConnected(): Boolean
}
