package ai.puente.ui

import ai.puente.BuildConfig
import ai.puente.core.SessionState
import ai.puente.core.ShoppingItem
import ai.puente.core.SuperFlow
import ai.puente.dat.GlassesBridge
import ai.puente.dat.TodoGlassesBridge
import ai.puente.net.WorkerClient
import android.os.Bundle
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * Pantalla mínima de demo (1 de las 4 máx). Un botón PTT dispara un turno
 * completo del SuperFlow contra el worker. Reemplaza TodoGlassesBridge por la
 * impl real (CameraAccess / MockDeviceKit) y esto corre el flujo en gafas.
 */
class MainActivity : AppCompatActivity() {

    private val worker by lazy { WorkerClient(BuildConfig.WORKER_BASE_URL) }

    // Dev sin gafas (recomendado para probar el flujo en el emulador):
    //   private val glasses by lazy { MockGlassesBridge(this, worker, mp4UriDeSuper) }
    // Real (fork CameraAccess): tu DatGlassesBridge() implementando GlassesBridge.
    private val glasses: GlassesBridge by lazy { TodoGlassesBridge() } // ← enchufar DAT/Mock

    // Estado demo: María, lista típica del flujo. visita_numero cambia el escenario.
    private val state = SessionState(
        session_id = "demo-${System.currentTimeMillis()}",
        usuario_id = "maria_demo",
        super_id = "walmart_portales",
        visita_numero = 2, // 2 = RAG hit; pon 1 para forzar visión (1ra visita)
        lista_compra = mutableListOf(
            ShoppingItem("leche deslactosada", preferencia = "Lala"),
            ShoppingItem("pan integral"),
            ShoppingItem("manzanas"),
        ),
    )

    private val userMd = "Nombre: María. Discapacidad: baja visión total. Idioma: es-MX. Marca leche: Lala deslactosada."
    private val memoryMd = "Super favorito: Walmart Portales. Siempre compra leche Lala. Visita 2: layout pasillo 7 lacteos."

    private lateinit var flow: SuperFlow
    private lateinit var log: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        log = TextView(this).apply { text = "Puente — listo. Mantén PTT y habla.\n" }
        val ptt = Button(this).apply { text = "PTT (escuchar)" }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(ptt); addView(log)
        })

        flow = SuperFlow(
            worker = worker,
            glasses = glasses,
            state = state,
            userMd = userMd,
            memoryMd = memoryMd,
            onState = { runOnUiThread { log.append("[estado] $it\n") } },
            onSpeech = { runOnUiThread { log.append("[habla] $it\n") } },
        )

        ptt.setOnClickListener {
            lifecycleScope.launch {
                runCatching { flow.handlePtt() }
                    .onFailure { runOnUiThread { log.append("[error] ${it.message}\n") } }
            }
        }
    }
}
