import Constants from "expo-constants";
import { Platform } from "react-native";
import { SessionState } from "./core/sessionState";
import { ContactRef } from "./net/types";
import { ANDREA_JPEG_B64 } from "./data/contactPhotos";

const extra = Constants.expoConfig?.extra as { workerBaseUrl?: string } | undefined;

function defaultWorkerUrl(): string {
  if (Platform.OS === "android") return "http://10.0.2.2:8787";
  return "http://localhost:8787";
}

/** Worker URL: EXPO_PUBLIC_WORKER_BASE_URL en .env o fallback por plataforma. */
export const WORKER_BASE_URL = extra?.workerBaseUrl || process.env.EXPO_PUBLIC_WORKER_BASE_URL || defaultWorkerUrl();

/** Header opcional si el worker tiene WORKER_API_KEY configurado. */
export const WORKER_API_KEY = process.env.EXPO_PUBLIC_WORKER_API_KEY ?? "";

/**
 * Producción: logs verbosos (DAT, STT, stream, tokens) van solo a consola. Con
 * EXPO_PUBLIC_DEBUG=1 también se pintan en pantalla y se sube el log del SDK DAT.
 */
export const SHOW_DEBUG_LOGS = process.env.EXPO_PUBLIC_DEBUG === "1";

/** MockDeviceKit: mp4 HEVC para dev sin gafas (Android). */
export const MOCK_VIDEO_URI = process.env.EXPO_PUBLIC_MOCK_VIDEO_URI;

/** MockDeviceKit: usa la cámara del propio teléfono como feed simulado de las
 * gafas (no requiere archivo de video). EXPO_PUBLIC_MOCK_FROM_CAMERA=1 */
export const MOCK_FROM_CAMERA = process.env.EXPO_PUBLIC_MOCK_FROM_CAMERA === "1";

/**
 * Gafas 100% simuladas en JS (MockGlassesBridge): sin DAT, sin módulo nativo,
 * sin cámara. El teléfono corre el loop completo (SuperFlow → Worker) usando
 * frames placeholder y transcripts guionados. EXPO_PUBLIC_USE_MOCK_GLASSES=1.
 */
export const USE_MOCK_GLASSES = process.env.EXPO_PUBLIC_USE_MOCK_GLASSES === "1";

/** Frases guionadas para el PTT cuando USE_MOCK_GLASSES=1 (una por toque). */
export const MOCK_GLASSES_TRANSCRIPTS = [
  "Agrega leche a mi lista",
  "¿Dónde está la leche?",
  "¿Qué producto es este?",
  "¿Qué me falta de la lista?",
  "¿Quién está enfrente de mí?",
];

/**
 * Contactos para reconocimiento social (Puente Caras). En producción la lista la
 * libera la app de Meta (nombre + relación + foto). Para demo/pruebas, agrega
 * aquí contactos con su foto de referencia en base64 (data URL o pelado). Vacío
 * por defecto: recognize entonces solo dirá "una persona, no la reconozco".
 */
export const DEMO_CONTACTS: ContactRef[] = [
  { name: "Andrea", relation: "amiga", image_base64: ANDREA_JPEG_B64 },
];

/** Proveedor de contactos inyectado en SuperFlow. */
export function loadContacts(): ContactRef[] {
  return DEMO_CONTACTS;
}

// Perfil del usuario REAL. La lista de compra NO se hardcodea: empieza vacía y
// se arma por voz ("agrega leche a mi lista"). Edita aquí tus datos reales.
export const USER_MD =
  "Nombre: José Raúl. Idioma: es-MX. La lista de compra la arma el usuario por voz durante la sesión.";
export const MEMORY_MD = "Usuario nuevo. Sin historial de visitas todavía.";

/** Estado de sesión real: usuario nuevo, lista vacía (se llena por voz),
 * visita_numero=1 (primera visita → visión, sin RAG previo). */
export function demoState(): SessionState {
  return {
    session_id: `sesion-${Date.now()}`,
    usuario_id: "jose_raul",
    super_id: "mi_super",
    visita_numero: 1,
    lista_compra: [],
    items_en_carrito: [],
    pending_confirm: false,
  };
}
