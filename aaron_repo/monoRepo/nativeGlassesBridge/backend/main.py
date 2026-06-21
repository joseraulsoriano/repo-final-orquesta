import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Dict, List, Any, Optional, TypedDict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from google.genai import types

import config
import maps_client
import distributor

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("native_bridge_server")

app = FastAPI(
    title="Meta Ray-Ban Native Glasses Bridge & Distributor",
    description="Servidor de ingestión de ultra-baja latencia con soporte para audio/video separados y LangGraph Swarm.",
    version="1.0.0"
)

# Directorio donde viven los system prompts oficiales del enjambre
SYSTEM_PROMPT_DIR = Path(__file__).resolve().parent.parent.parent / "glassesWatch" / "system_prompts"

def load_prompt(filename: str) -> str:
    """Lee dinámicamente un system prompt desde la carpeta glassesWatch/system_prompts/"""
    path = SYSTEM_PROMPT_DIR / filename
    if path.exists():
        return path.read_text(encoding="utf-8")
    else:
        logger.warning(f"Archivo de prompt no encontrado en {path}. Usando fallback vacío.")
        return ""

# ==========================================
# DEFINICIÓN DE ESTADO Y GRAFO DE LANGGRAPH
# ==========================================
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    session_id: str
    markdown_percept: str
    messages: List[Dict[str, str]]
    current_route: Optional[Dict[str, Any]]
    shopping_list: List[Dict[str, Any]]
    spatial_target: Optional[str]
    next_agent: str  # "emergency" | "mobility" | "shopper" | "speak"
    response_text: str
    vibrate_ms: int

def call_llm(system_instruction: str, prompt: str) -> str:
    """Invoca a Gemini 2.5 Flash con instrucción de sistema."""
    if not config.GEMINI_API_KEY:
        raise ValueError("Error: GEMINI_API_KEY no configurado en el archivo .env.")
        
    from google import genai
    client = genai.Client(api_key=config.GEMINI_API_KEY)
    response = client.models.generate_content(
        model=config.VLM_MODEL,
        contents=[prompt],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2
        )
    )
    return response.text.strip()

def parse_orchestrator_response(output: str) -> tuple[str, str]:
    """Parsea la salida del orquestador estructurado en glassesWatch."""
    next_agent = "speak"
    payload = ""
    
    # Buscar Action
    action_match = re.search(r"Action:\s*(Route to Agent\s+(?P<agent>[a-zA-Z0-9_\s]+)|Speak to User)", output, re.IGNORECASE)
    if action_match:
        agent_group = action_match.group("agent")
        if agent_group:
            agent_clean = agent_group.lower().strip()
            if "emergency" in agent_clean or "triage" in agent_clean:
                next_agent = "emergency"
            elif "mobility" in agent_clean or "movilidad" in agent_clean:
                next_agent = "mobility"
            elif "shopper" in agent_clean or "compras" in agent_clean:
                next_agent = "shopper"
            elif "clinical" in agent_clean or "clínico" in agent_clean or "contención" in agent_clean or "contencion" in agent_clean:
                next_agent = "clinical"
                
    # Buscar Payload
    payload_match = re.search(r"Payload:\s*(?P<val>.*)", output, re.DOTALL | re.IGNORECASE)
    if payload_match:
        payload = payload_match.group("val").strip().strip('"').strip("'")
    else:
        payload = output
        
    return next_agent, payload

THERAPEUTIC_WELCOME_PROMPT = """
Eres un asistente terapéutico de orientación y movilidad para personas ciegas o con discapacidad visual.
Tu tono es calmado, empático, seguro y estructurado. Tu objetivo es brindar una bienvenida cálida que reduzca la ansiedad espacial y proporcione orientación inmediata del entorno físico actual.

Recibirás una descripción del entorno visual (Vision_Data) generada por el modelo de visión.
Debes hacer lo siguiente:
1. Saludar de forma muy cálida y humana al usuario presentándote con tu nombre de asistente (ej: "Hola, soy tu asistente {assistant_name}.").
2. Describir de forma objetiva, pausada y espacialmente clara lo que tiene justo enfrente a su nivel visual (ej: "Frente a ti a unos 4 pasos se observa una puerta despejada...", "Detecto una mesa frente a ti a unos 2 pasos...").
3. Finalizar preguntando amigablemente qué le gustaría hacer hoy o a dónde le gustaría ir (ej: "¿Qué te gustaría hacer hoy?", "¿A dónde nos dirigimos hoy?").

Reglas estrictas:
- Mantén la descripción espacial muy sencilla para no saturar al usuario (evitar fatiga cognitiva).
- Usa referencias claras de pasos y direcciones espaciales.
- Transmite tranquilidad y apoyo profesional.
"""

async def generate_therapeutic_welcome(markdown_percept: str) -> str:
    prompt = THERAPEUTIC_WELCOME_PROMPT.replace("{assistant_name}", config.ASSISTANT_NAME)
    user_input = f"Entorno actual percibido: {markdown_percept}"
    try:
        output = call_llm(prompt, user_input)
        return output
    except Exception as e:
        logger.error(f"Error generando bienvenida terapéutica: {e}")
        return f"Hola, soy tu asistente {config.ASSISTANT_NAME}. Detecto un entorno estable frente a ti. ¿Qué te gustaría hacer hoy?"

# --- NODOS DEL GRAFO ---

async def orchestrator_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: orchestrator")
    prompt = load_prompt("01_orquestador.md")
    user_input = f"[Vision_Data: {state['markdown_percept']}]"
    if state["current_route"]:
        user_input += f" [Route_Summary: {state['current_route']['destination']['name']}]"
    if state["spatial_target"]:
        user_input += f" [Spatial_Target_Requested: {state['spatial_target']}]"
        
    output = call_llm(prompt, user_input)
    next_agent, payload = parse_orchestrator_response(output)
    
    state["next_agent"] = next_agent
    state["response_text"] = payload
    return state

async def emergency_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: emergency_triage")
    prompt = load_prompt("05_emergencias_triage.md")
    user_input = f"Reporte de entorno crítico: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["vibrate_ms"] = 500
    state["next_agent"] = "speak"
    return state

async def mobility_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: spatial_mobility")
    prompt = load_prompt("02_movilidad.md")
    
    route_context = ""
    if state["current_route"]:
        steps = state["current_route"]["route_details"]["steps"]
        if steps:
            route_context = f"Siguiente paso de Google Maps: {steps[0]['instruction']}"
            
    user_input = f"Contexto de ruta: {route_context}."
    if state["spatial_target"]:
        user_input += f" Objetivo: {state['spatial_target']}."
    user_input += f" Entorno visual: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

async def shopper_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: shopper_orchestrator")
    prompt = load_prompt("07_shopper_orquestador.md")
    list_prompt = load_prompt("10_gestor_lista.md")
    combined = f"{prompt}\n\n{list_prompt}"
    
    items_desc = ", ".join([f"{i['item']} ({i['status']})" for i in state["shopping_list"]])
    user_input = f"Lista de compra: [{items_desc}]. Percepción actual: {state['markdown_percept']}"
    output = call_llm(combined, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state
    
async def clinical_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: clinical_containment")
    prompt = load_prompt("03_clinico_contencion.md")
    user_input = f"Reporte de entorno y estrés: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

async def memory_rag_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: memory_rag")
    prompt = load_prompt("04_memoria_rag.md")
    user_input = f"Consulta de memoria: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

async def digital_bridge_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: digital_bridge")
    prompt = load_prompt("06_puente_digital.md")
    user_input = f"Estado de escritorio: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

async def aisle_navigator_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: aisle_navigator")
    prompt = load_prompt("08_navegador_pasillos.md")
    user_input = f"Escaneo de pasillos y letreros: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

async def product_inspector_node(state: AgentState) -> AgentState:
    logger.info("LangGraph Node: product_inspector")
    prompt = load_prompt("09_inspector_productos.md")
    user_input = f"Inspección macro de etiqueta del producto: {state['markdown_percept']}"
    output = call_llm(prompt, user_input)
    
    state["response_text"] = output
    state["next_agent"] = "speak"
    return state

# --- COMPILACIÓN DEL GRAFO ---
workflow = StateGraph(AgentState)
workflow.add_node("orchestrator", orchestrator_node)
workflow.add_node("emergency", emergency_node)
workflow.add_node("mobility", mobility_node)
workflow.add_node("shopper", shopper_node)
workflow.add_node("clinical", clinical_node)
workflow.add_node("memory_rag", memory_rag_node)
workflow.add_node("digital_bridge", digital_bridge_node)
workflow.add_node("aisle_navigator", aisle_navigator_node)
workflow.add_node("product_inspector", product_inspector_node)

workflow.set_entry_point("orchestrator")

def route_decision(state: AgentState) -> str:
    return state["next_agent"]

workflow.add_conditional_edges(
    "orchestrator",
    route_decision,
    {
        "emergency": "emergency",
        "mobility": "mobility",
        "shopper": "shopper",
        "clinical": "clinical",
        "memory_rag": "memory_rag",
        "digital_bridge": "digital_bridge",
        "aisle_navigator": "aisle_navigator",
        "product_inspector": "product_inspector",
        "speak": END
    }
)

workflow.add_edge("emergency", END)
workflow.add_edge("mobility", END)
workflow.add_edge("shopper", END)
workflow.add_edge("clinical", END)
workflow.add_edge("memory_rag", END)
workflow.add_edge("digital_bridge", END)
workflow.add_edge("aisle_navigator", END)
workflow.add_edge("product_inspector", END)

langgraph_app = workflow.compile()
logger.info("LangGraph Swarm compiled successfully.")

# ==========================================
# GESTIÓN DE SESIONES EN RAM
# ==========================================
class SessionState:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.transcript_buffer = ""
        self.current_route = None
        self.shopping_list = []
        self.spatial_target = None
        self.last_triggered_command = ""
        self.active_connections: Dict[str, WebSocket] = {}
        self.is_new_session = True
        
    def add_connection(self, channel_type: str, ws: WebSocket):
        self.active_connections[channel_type] = ws
        
    def get_connection(self, channel_type: str) -> Optional[WebSocket]:
        return self.active_connections.get(channel_type)

class ActiveSessionsManager:
    def __init__(self):
        self.sessions: Dict[str, SessionState] = {}
        
    def get_or_create(self, session_id: str) -> SessionState:
        if session_id not in self.sessions:
            logger.info(f"Creando nuevo estado de sesión en RAM para session_id: {session_id}")
            self.sessions[session_id] = SessionState(session_id)
        return self.sessions[session_id]
        
    def remove(self, session_id: str):
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Removiendo sesión activa: {session_id}")

sessions_manager = ActiveSessionsManager()

@app.get("/")
async def root() -> Dict[str, Any]:
    return {
        "status": "online",
        "service": "native-glasses-bridge-server",
        "assistant_name": config.ASSISTANT_NAME,
        "prompts_loaded_from": str(SYSTEM_PROMPT_DIR),
        "google_maps_configured": bool(config.GOOGLE_MAPS_API_KEY),
        "gemini_vlm_configured": bool(config.GEMINI_API_KEY)
    }

# ==========================================
# WS AUDIO CHANNEL (Streaming continuo PCM)
# ==========================================
@app.websocket("/ws/audio")
async def audio_stream_endpoint(websocket: WebSocket, session_id: str = Query(...)):
    await websocket.accept()
    session = sessions_manager.get_or_create(session_id)
    session.add_connection("audio", websocket)
    logger.info(f"Conexión de AUDIO establecida para sesión: {session_id}")
    
    try:
        while True:
            data = await websocket.receive()
            if data.get("type") == "websocket.disconnect":
                raise WebSocketDisconnect(code=data.get("code", 1000))
                
            if "bytes" in data:
                # Los bytes PCM crudos se reciben aquí de forma continua
                pass
            elif "text" in data:
                text_message = json.loads(data["text"])
                if text_message.get("type") == "transcript":
                    text = text_message.get("text", "").strip()
                    logger.info(f"[{session_id}] Transcripción: '{text}'")
                    session.transcript_buffer = text
                    asyncio.create_task(process_voice_command(session, text))
                        
    except WebSocketDisconnect:
        logger.info(f"Conexión de AUDIO desconectada: {session_id}")
        if not session.get_connection("video"):
            sessions_manager.remove(session_id)

# ==========================================
# WS VIDEO CHANNEL (Ingestión discreta frames)
# ==========================================
@app.websocket("/ws/video")
async def video_stream_endpoint(websocket: WebSocket, session_id: str = Query(...)):
    await websocket.accept()
    session = sessions_manager.get_or_create(session_id)
    session.add_connection("video", websocket)
    logger.info(f"Conexión de VIDEO establecida para sesión: {session_id}")
    
    try:
        while True:
            frame_bytes = await websocket.receive_bytes()
            current_transcript = session.transcript_buffer
            
            # 1. Ingestión del Agente Distribuidor (Multimodal VLM)
            markdown_percept = await distributor.run_distributor_agent(
                frame_bytes=frame_bytes,
                transcript_text=current_transcript
            )
            
            # Comprobación de primera conexión: bienvenida terapéutica de orientación
            if session.is_new_session:
                session.is_new_session = False
                logger.info(f"[{session_id}] Primer frame recibido. Generando bienvenida y orientación terapéutica...")
                welcome_text = await generate_therapeutic_welcome(markdown_percept)
                
                payload = {
                    "action": "SPEAK",
                    "payload": {
                        "text": welcome_text
                    }
                }
                await websocket.send_json(payload)
                # Omitir el procesamiento del grafo en este primer frame de saludo inicial
                continue
            
            # 2. Ejecutar la gráfica real de LangGraph
            initial_state = {
                "session_id": session_id,
                "markdown_percept": markdown_percept,
                "messages": [],
                "current_route": session.current_route,
                "shopping_list": session.shopping_list,
                "spatial_target": session.spatial_target,
                "next_agent": "speak",
                "response_text": "",
                "vibrate_ms": 0
            }
            
            try:
                final_state = await langgraph_app.ainvoke(initial_state)
                
                # Sincronizar cambios de vuelta en RAM
                session.current_route = final_state.get("current_route")
                session.shopping_list = final_state.get("shopping_list")
                session.spatial_target = final_state.get("spatial_target")
                
                response_text = final_state.get("response_text", "").strip()
                vibrate_ms = final_state.get("vibrate_ms", 0)
                
                if response_text:
                    payload = {
                        "action": "SPEAK_ALERT" if vibrate_ms > 0 else "SPEAK",
                        "payload": {
                            "text": response_text,
                            "vibrate_ms": vibrate_ms
                        }
                    }
                    await websocket.send_json(payload)
            except Exception as graph_err:
                logger.error(f"Error procesando grafo en sesión {session_id}: {graph_err}")
                
    except WebSocketDisconnect:
        logger.info(f"Conexión de VIDEO desconectada: {session_id}")
        if not session.get_connection("audio"):
            sessions_manager.remove(session_id)

# --- TRIGGER DE NAVEGACIÓN ---
async def trigger_navigation_flow(session: SessionState, place_type: str, product: Optional[str]):
    user_lat, user_lng = 19.4326, -99.1332  # Mock GPS inicial
    
    place = await maps_client.find_closest_place(user_lat, user_lng, place_type)
    if not place:
        await send_tts_announcement(session, f"Lo siento, no encontré ningún {place_type} cercano.")
        return
        
    route = await maps_client.calculate_walking_route(user_lat, user_lng, place["lat"], place["lng"])
    if not route:
        await send_tts_announcement(session, f"No se pudo calcular una ruta a pie hacia {place['name']}.")
        return
        
    session.current_route = {
        "destination": place,
        "route_details": route
    }
    
    if product:
        session.shopping_list.append({"item": product, "status": "pending"})
        
    video_ws = session.get_connection("video")
    if video_ws:
        payload = {
            "action": "START_PERCEPTUAL_LOOP",
            "payload": {
                "route_summary": f"Ruta a {place['name']} a {route['distance_m']} metros. Tiempo estimado: {round(route['duration_s']/60)} minutos.",
                "product": product or "",
                "destination_name": place["name"]
            }
        }
        await video_ws.send_json(payload)
    else:
        await send_tts_announcement(session, f"Ruta lista a {place['name']}. Por favor activa la cámara.")

async def send_tts_announcement(session: SessionState, text: str):
    ws = session.get_connection("video") or session.get_connection("audio")
    if ws:
        await ws.send_json({
            "action": "SPEAK",
            "payload": {"text": text}
        })

# --- PROCESADOR DE COMANDOS DE VOZ ---
async def process_voice_command(session: SessionState, text: str):
    # Evitar doble ejecución si es el mismo texto que ya disparó recientemente
    if text == session.last_triggered_command:
        return
        
    text_clean = text.lower().strip()
    assistant_name = config.ASSISTANT_NAME.lower()
    
    # Soporta: "hola aaron", "hey aaron", "ey aaron", "oye aaron", "aaron"
    wake_words_pattern = rf"^(hola|hey|ey|oye)?\s*{assistant_name}[,\s]+"
    
    match_wake = re.match(wake_words_pattern, text_clean)
    if not match_wake:
        # Si no empieza con el wake-word, no hacemos nada
        return
        
    # Extraer comando limpio
    command = text_clean[match_wake.end():].strip()
    logger.info(f"[{session.session_id}] Comando detectado: '{command}'")
    
    # 1. Cancelar navegación / Detenerse
    if any(word in command for word in ["detente", "cancela", "cancelar", "detén", "parar", "stop"]):
        session.last_triggered_command = text
        await trigger_cancel_navigation(session)
        return
        
    # 2. Ruta de Google Maps: "vamos al [lugar] más cercano (a comprar [producto])"
    maps_match = re.match(
        r"^(?:vamos\s+al|ir\s+al|busca\s+el|ll[eé]vame\s+al)\s+(?P<place>\w+)\s+m[aá]s\s+cercano(?:\s+a\s+comprar\s+(?P<product>.+))?",
        command
    )
    if maps_match:
        session.last_triggered_command = text
        place_type = maps_match.group("place")
        product = maps_match.group("product")
        logger.info(f"[{session.session_id}] Comando Maps de voz: Destino={place_type}, Producto={product}")
        asyncio.create_task(trigger_navigation_flow(session, place_type, product))
        return
        
    # 3. Guía Espacial / Visual: "quiero llegar a la puerta"
    spatial_match = re.match(
        r"^(?:quiero\s+llegar\s+a|gu[ií]ame\s+a|ll[eé]vame\s+a)\s+(?:la|el|las|los|ese|esa|un|una)?\s*(?P<target>.+)",
        command
    )
    if spatial_match:
        session.last_triggered_command = text
        target = spatial_match.group("target").strip()
        logger.info(f"[{session.session_id}] Comando Espacial de voz: Objetivo={target}")
        asyncio.create_task(trigger_spatial_guidance(session, target))
        return
        
    # 4. Consulta de entorno / Descripción: "qué ves", "describe mi entorno", "qué hay en mi entorno", "qué hay al frente"
    if any(phrase in command for phrase in ["qué ves", "que ves", "describe mi entorno", "describe el entorno", "qué hay en mi entorno", "que hay en mi entorno", "qué hay al frente", "que hay al frente", "qué hay a mi alrededor", "que hay a mi alrededor"]):
        session.last_triggered_command = text
        logger.info(f"[{session.session_id}] Comando Consulta de entorno detectado.")
        asyncio.create_task(trigger_environment_description(session))
        return

async def trigger_environment_description(session: SessionState):
    session.spatial_target = "entorno general"
    session.current_route = None  # Limpiar ruta de mapas si hay una activa
    
    msg = "Entendido, describiendo tu entorno de frente."
    logger.info(f"[{session.session_id}] Iniciando descripción general del entorno.")
    
    video_ws = session.get_connection("video")
    if video_ws:
        payload = {
            "action": "START_PERCEPTUAL_LOOP",
            "payload": {
                "route_summary": msg,
                "product": "",
                "destination_name": "entorno general"
            }
        }
        await video_ws.send_json(payload)
    else:
        await send_tts_announcement(session, f"{msg} Por favor activa la cámara.")

async def trigger_spatial_guidance(session: SessionState, target: str):
    session.spatial_target = target
    session.current_route = None  # Limpiar ruta de mapas si hay una activa
    
    msg = f"Entendido, buscando {target} en tu campo visual para guiarte."
    logger.info(f"[{session.session_id}] Iniciando guía espacial hacia: {target}")
    
    video_ws = session.get_connection("video")
    if video_ws:
        payload = {
            "action": "START_PERCEPTUAL_LOOP",
            "payload": {
                "route_summary": msg,
                "product": "",
                "destination_name": target
            }
        }
        await video_ws.send_json(payload)
    else:
        await send_tts_announcement(session, f"{msg} Por favor activa la cámara.")

async def trigger_cancel_navigation(session: SessionState):
    session.spatial_target = None
    session.current_route = None
    session.shopping_list = []
    
    msg = "Navegación cancelada y objetivos borrados."
    logger.info(f"[{session.session_id}] Navegación cancelada.")
    await send_tts_announcement(session, msg)
