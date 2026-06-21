import logging
import base64
import sys
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
from google import genai
from google.genai import types
import config

logger = logging.getLogger(__name__)

# Intentar integrar el pipeline de visión local de eyesstreelighttalk
sys.path.append("/Users/aaron/dev/platanusHack/eyesstreelighttalk")
local_pipeline = None

try:
    from src.pipeline import TrafficScenePipeline
    from src.config import PipelineConfig
    from src.color_classifier import LightState
    
    cfg = PipelineConfig()
    # Usar el modelo tiny por defecto para acelerar el procesamiento en hilos locales
    cfg.detector.model = "tiny"
    # Resolver rutas absolutas relativas al directorio original del pipeline
    original_models_dir = Path("/Users/aaron/dev/platanusHack/eyesstreelighttalk/models")
    cfg.detector.names_path = original_models_dir / "coco.names"
    
    # El detector buscará los archivos cfg y weights en esta ruta
    # Validamos si existen antes de instanciar para evitar una excepción fatal
    if cfg.detector.cfg_path.exists() and cfg.detector.weights_path.exists():
        local_pipeline = TrafficScenePipeline(cfg)
        logger.info("Pipeline de visión local (YOLO Tiny) inicializado exitosamente.")
    else:
        logger.warning(
            f"Archivos de modelo YOLO no encontrados en {original_models_dir}.\n"
            "El pipeline de visión local estará inactivo (VLM-only).\n"
            "Descarga los pesos ejecutando:\n"
            "  cd /Users/aaron/dev/platanusHack/eyesstreelighttalk && bash scripts/download_models.sh"
        )
except Exception as e:
    logger.warning(f"No se pudo cargar el pipeline de visión local de eyesstreelighttalk: {e}. Continuando en modo VLM puro.")

# Prompt de sistema oficial del Agente Distribuidor
DISTRIBUTOR_SYSTEM_PROMPT = """
Eres el Agente Distribuidor/Percepción de un enjambre de asistencia visual para personas con discapacidad visual.
Tu única función es traducir el mundo analógico (lo que se ve en la imagen y lo que dice el usuario en el texto) a un Markdown estandarizado limpio.
No tomes decisiones lógicas ni des indicaciones directivas de seguridad (no digas "cruza", "detente", "espera").
Limítate a describir la geometría del entorno de forma objetiva, distancias aproximadas en pasos y el estado de semáforos u obstáculos.

Tu salida DEBE seguir estrictamente el siguiente esquema de Markdown:
[Vision_Data: <descripción espacial del entorno, semáforos peatones, cruces, obstáculos, vehículos>] [Audio_User: "<transcripción literal de la voz del usuario>"]
"""

# Inicializar cliente de Gemini si la API key está presente
_client = None
if config.GEMINI_API_KEY:
    try:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    except Exception as e:
        logger.error(f"Error al inicializar el cliente de Google GenAI: {e}")

async def run_distributor_agent(frame_bytes: bytes, transcript_text: str) -> str:
    """
    Toma un frame de video (bytes de JPEG) y la transcripción parcial de audio acumulada,
    y ejecuta el modelo de visión multimodal de Gemini para generar la percepción analógica en Markdown.
    
    Adicionalmente, si el pipeline de visión local (YOLO) está activo, procesa el frame
    para inyectar detecciones precisas de semáforos y vehículos como metadatos para el VLM.
    """
    local_cv_context = ""
    
    # 1. Ejecutar procesamiento local YOLO si está activo
    if local_pipeline is not None:
        try:
            # Decodificar JPEG a imagen BGR de OpenCV
            nparr = np.frombuffer(frame_bytes, np.uint8)
            cv_frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if cv_frame is not None:
                # Ejecutar pipeline local
                result = local_pipeline.process(cv_frame)
                
                # Formatear el contexto del análisis local
                local_cv_context = (
                    f"\n[Análisis de Visión Local YOLO] "
                    f"Veredicto de cruce: {result.crossing.verdict.value}. "
                    f"Semáforo peatonal: {result.light_state.value}. "
                    f"Conteos en escena: {result.counts}."
                )
                logger.info(f"Fusión local CV exitosa: {local_cv_context.strip()}")
        except Exception as cv_err:
            logger.error(f"Error en el procesamiento de visión local: {cv_err}")

    if not _client:
        raise ValueError("Error: GEMINI_API_KEY no configurado. El Agente Distribuidor requiere una clave API activa.")

    try:
        # Preparar la imagen para Gemini
        image_part = types.Part.from_bytes(
            data=frame_bytes,
            mime_type="image/jpeg"
        )
        
        # Combinar el prompt multimodal con la telemetría del análisis rápido de visión local
        prompt = (
            f"Basándote en la imagen adjunta del entorno y en la transcripción de audio actual "
            f"del usuario que es: '{transcript_text}', genera el Markdown estandarizado."
        )
        if local_cv_context:
            prompt += (
                f"\nConsidera también el siguiente reporte de visión rápida local que corrió "
                f"en el procesador del dispositivo: {local_cv_context}\n"
                f"Usa esta información para corroborar el estado del semáforo y del tráfico."
            )

        # Ejecutar modelo
        response = _client.models.generate_content(
            model=config.VLM_MODEL,
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                system_instruction=DISTRIBUTOR_SYSTEM_PROMPT,
                temperature=0.1,  # Baja temperatura para máxima objetividad
            )
        )
        
        result = response.text.strip()
        logger.info(f"Distributor Agent Output: {result}")
        return result

    except Exception as e:
        logger.error(f"Error al ejecutar el Agente Distribuidor en Gemini: {e}")
        raise e

