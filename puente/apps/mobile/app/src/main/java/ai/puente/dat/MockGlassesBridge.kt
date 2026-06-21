package ai.puente.dat

import ai.puente.net.Gps
import ai.puente.net.WorkerClient
import android.Manifest
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.annotation.RequiresPermission
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.ResponseBody
import java.io.File

/**
 * GlassesBridge para DESARROLLO sin gafas. Cámara = MockDeviceKit (frames desde un
 * mp4 de super); mic/altavoz/GPS = teléfono. Cumple el mismo contrato que la impl
 * real DAT, así que el flujo completo corre en el emulador contra `wrangler dev`.
 *
 * Cuando llegue Gen 2, solo se sustituye la fuente del frame (sección camera).
 * Ver INTEGRACION.md §"Probar SIN gafas".
 */
class MockGlassesBridge(
    private val context: Context,
    private val worker: WorkerClient,
    private val mockVideoMp4: android.net.Uri,   // mp4 h.264/h.265 de pasillo de super
) : GlassesBridge {

    private val http = WorkerClient.defaultClient()

    // ---- CÁMARA (MockDeviceKit) ----
    override suspend fun captureFrameJpegBase64(): String = withContext(Dispatchers.IO) {
        // TODO DAT mock — API exacta a verificar contra el sample/MockDeviceKit:
        //   mockKit.enable()
        //   val glasses = mockKit.pairRaybanMeta()
        //   glasses.services.camera.setCameraFeed(mockVideoMp4)   // h.264/h.265
        //   val photo = glasses.services.camera.capturePhoto()    // PhotoData (JPEG)
        //   android.util.Base64.encodeToString(photo.bytes, Base64.NO_WRAP)
        // El JPEG debe salir ~504x896 (DAT MEDIUM) para cumplir el SLA de visión.
        TODO("MockDeviceKit: setCameraFeed($mockVideoMp4) → capturePhoto() → JPEG base64 (504x896)")
    }

    // ---- GPS (teléfono) ----
    override fun gps(): Gps {
        // Demo: coordenadas de Walmart Portales. En real: FusedLocationProviderClient.
        return Gps(lat = 19.39, lng = -99.17, accuracyM = 10)
    }

    // ---- TTS → altavoz (gafas si BT emparejado, si no teléfono) ----
    override suspend fun playTts(audio: ResponseBody) = withContext(Dispatchers.IO) {
        // mp3 → archivo temporal → MediaPlayer. (Streaming real: ExoPlayer con la URL
        // del worker; aquí priorizamos simplicidad de la prueba.)
        val tmp = File.createTempFile("tts", ".mp3", context.cacheDir)
        audio.byteStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
        val done = java.util.concurrent.CountDownLatch(1)
        MediaPlayer().apply {
            setDataSource(tmp.absolutePath)
            setOnCompletionListener { it.release(); tmp.delete(); done.countDown() }
            setOnErrorListener { mp, _, _ -> mp.release(); tmp.delete(); done.countDown(); true }
            prepare(); start()
        }
        done.await()
    }

    // ---- Vibración (alertas) ----
    override fun vibrate(ms: Long) {
        val v = context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE))
        else @Suppress("DEPRECATION") v.vibrate(ms)
    }

    // ---- PTT: mic → AssemblyAI streaming → transcript ----
    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    override suspend fun listenOnce(): String = withContext(Dispatchers.IO) {
        val stt = AssemblyAiStt(worker.transcribeTokenRaw(), http).apply { connect() }
        val sampleRate = 16000
        val minBuf = AudioRecord.getMinBufferSize(
            sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
        )
        val rec = AudioRecord(
            MediaRecorder.AudioSource.VOICE_RECOGNITION, sampleRate,
            AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf
        )
        // ~100 ms por chunk (dentro de 50–1000 ms).
        val chunk = ByteArray(sampleRate / 10 * 2)
        val maxMs = 8000L
        val start = System.currentTimeMillis()
        try {
            rec.startRecording()
            while (!stt.endOfTurn && !stt.failed &&
                System.currentTimeMillis() - start < maxMs) {
                val n = rec.read(chunk, 0, chunk.size)
                if (n > 0) stt.sendAudio(chunk, n)
            }
        } finally {
            rec.stop(); rec.release()
        }
        stt.terminate()  // SIEMPRE — evita facturación colgada
    }

    override fun isConnected(): Boolean = true  // mock siempre "conectado"
}
