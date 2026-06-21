import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { EMWDATStreamView, handleUrl } from "expo-meta-wearables-dat";

import { SuperFlow } from "./src/core/superFlow";
import {
  demoState,
  loadContacts,
  MEMORY_MD,
  MOCK_FROM_CAMERA,
  MOCK_GLASSES_TRANSCRIPTS,
  MOCK_VIDEO_URI,
  SHOW_DEBUG_LOGS,
  USE_MOCK_GLASSES,
  USER_MD,
  WORKER_BASE_URL,
} from "./src/config";
import { WorkerClient } from "./src/net/workerClient";
import { GlassesBridge } from "./src/dat/glassesBridge";
import { WrapperBridge } from "./src/dat/wrapperBridge";
import { MockGlassesBridge } from "./src/dat/mockGlassesBridge";

export default function App() {
  const [said, setSaid] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const [continuous, setContinuous] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const flowRef = useRef<SuperFlow | null>(null);
  const bridgeRef = useRef<GlassesBridge | null>(null);

  // Producción: todo va a consola; la pantalla solo en modo debug.
  const log = (s: string) => {
    console.log(s);
    if (SHOW_DEBUG_LOGS) setLines((prev) => [...prev.slice(-150), s]);
  };
  // Voz de Puente: el texto real (sin prefijo "[…]") se muestra limpio; los
  // breadcrumbs de diagnóstico que llegan por el mismo hook van solo a consola.
  const onSpeech = (t: string) => {
    if (t.startsWith("[")) {
      log(t);
      return;
    }
    setSaid((prev) => [...prev.slice(-12), t]);
  };

  useEffect(() => {
    const linkSub = Linking.addEventListener("url", ({ url }: { url: string }) => {
      log(`[deeplink] ${url}`);
      handleUrl(url).catch((e) => log(`[deeplink:error] ${(e as Error).message}`));
    });
    (async () => {
      // Procesa el callback de registro pendiente (Meta AI → puente://) ANTES de
      // init, para que getRegistrationStateAsync ya refleje "registered" y NO se
      // re-dispare startRegistration → bucle infinito de consentimiento.
      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          log(`[deeplink:init] ${initialUrl}`);
          const consumed = await handleUrl(initialUrl);
          log(`[deeplink:init] handleUrl consumed=${consumed}`);
        }
      } catch (e) {
        log(`[deeplink:error] ${(e as Error).message}`);
      }

      const worker = new WorkerClient(WORKER_BASE_URL);
      const bridge: GlassesBridge = USE_MOCK_GLASSES
        ? new MockGlassesBridge({ transcripts: [...MOCK_GLASSES_TRANSCRIPTS], onLog: log })
        : new WrapperBridge(worker, log);
      bridgeRef.current = bridge;
      try {
        if (USE_MOCK_GLASSES) {
          log("[init] gafas SIMULADAS (USE_MOCK_GLASSES=1) — cel activo sin hardware");
          await bridge.init();
        } else {
          const mockOpts = MOCK_VIDEO_URI
            ? { mockVideoUri: MOCK_VIDEO_URI }
            : MOCK_FROM_CAMERA
              ? { mockFromCamera: true }
              : undefined;
          log(`[init] mock=${mockOpts ? (MOCK_FROM_CAMERA ? "cámara" : "video") : "no (gafas reales)"} — arrancando DAT…`);
          await bridge.init(mockOpts);
        }
        setSessionId(bridge.getSessionId());
        log(`Listo. Worker: ${WORKER_BASE_URL}. Mantén PTT y habla.`);
      } catch (e) {
        const err = e as Error;
        log(`[init:error] ${err.name}: ${err.message}`);
        if (err.stack) log(`[init:stack] ${err.stack.split("\n").slice(0, 3).join(" | ")}`);
        return;
      }
      flowRef.current = new SuperFlow(
        worker,
        bridge,
        demoState(),
        USER_MD,
        MEMORY_MD,
        {
          onState: (s) => log(`[estado] ${s}`),
          onSpeech,
        },
        loadContacts
      );
      const flow = flowRef.current;
      // Saludo de arranque por ElevenLabs (worker /tts → altavoces de las gafas):
      // apenas se abre la sesión, el usuario OYE que Puente ya está en vivo.
      try {
        await flow.announce(
          "Puente está en vivo. Háblame cuando quieras y te describo lo que tienes enfrente."
        );
      } catch (e) {
        log(`[tts:arranque:error] ${(e as Error).message}`);
      }
      // Auto-arranque: al abrir la app, el live loop se activa SOLO (sin botón).
      // Cada apertura = lentes describiendo el entorno y alimentando la DB temp.
      log("[sentido] auto-arranque del live loop…");
      setContinuous(true);
      flow.startSentidoContinuo().finally(() => setContinuous(false));
      // Mic vivo: al abrir la sesión, el micrófono queda encendido en escucha
      // continua (sin botón). Convive con el Sentido continuo; SuperFlow coordina
      // los turnos para que el mic no grabe la propia voz del TTS.
      log("[mic] mic vivo encendido — habla cuando quieras…");
      flow.startLiveMic();
    })();

    return () => {
      linkSub.remove();
      flowRef.current?.stopLiveMic();
      flowRef.current?.stopSentidoContinuo();
      bridgeRef.current?.dispose().catch(() => undefined);
    };
  }, []);

  return (
    <View style={styles.root}>
      {sessionId && !USE_MOCK_GLASSES ? (
        <EMWDATStreamView isActive style={styles.hiddenStream} resizeMode="cover" />
      ) : null}
      <View style={[styles.banner, continuous && styles.bannerOn]}>
        <Text style={styles.bannerText}>
          {continuous ? "● EN VIVO — describiendo el entorno" : "Conectando lentes…"}
        </Text>
      </View>
      <ScrollView style={styles.said} contentContainerStyle={styles.saidContent}>
        {said.map((t, i) => (
          <Text key={i} style={styles.saidLine}>
            {t}
          </Text>
        ))}
      </ScrollView>
      {SHOW_DEBUG_LOGS ? (
        <ScrollView style={styles.log}>
          {lines.map((l, i) => (
            <Text key={i} style={styles.line}>
              {l}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 60, paddingHorizontal: 16, backgroundColor: "#0b0b0c" },
  hiddenStream: { width: 1, height: 1, opacity: 0, position: "absolute" },
  banner: { backgroundColor: "#2d3748", padding: 20, borderRadius: 16, alignItems: "center" },
  bannerOn: { backgroundColor: "#2f855a" },
  bannerText: { color: "#fff", fontSize: 18, fontWeight: "600" },
  said: { marginTop: 20, flex: 1 },
  saidContent: { justifyContent: "flex-end", flexGrow: 1 },
  saidLine: { color: "#f5f5f5", fontSize: 22, lineHeight: 30, marginBottom: 16 },
  log: { maxHeight: 180, marginTop: 12, borderTopWidth: 1, borderTopColor: "#222" },
  line: { color: "#8a8a8a", fontSize: 12, marginBottom: 3 },
});
