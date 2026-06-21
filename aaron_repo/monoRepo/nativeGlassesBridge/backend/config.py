import os
from pathlib import Path
from dotenv import load_dotenv

# Cargar variables de entorno desde un archivo .env si existe
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)

# Nombre del asistente personalizable (Wake Word)
ASSISTANT_NAME = os.environ.get("ASSISTANT_NAME", "Aaron")

# API Keys
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", os.environ.get("GOOGLE_API_KEY", ""))
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# Configuración del servidor
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8000"))

# Modelo VLM para el Agente Distribuidor
VLM_MODEL = os.environ.get("VLM_MODEL", "gemini-2.5-flash")
