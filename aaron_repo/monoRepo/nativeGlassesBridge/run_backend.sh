#!/bin/bash
# Script de automatización para levantar el backend del puente nativo de Meta Ray-Ban

# Colores para salida en consola
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # Sin color

echo -e "${BLUE}=== Inicializando Servidor del Puente de Gafas Meta Ray-Ban ===${NC}"

# Cambiar al directorio del backend
cd "$(dirname "$0")/backend" || exit 1

# 1. Crear entorno virtual si no existe
JUST_CREATED=false
if [ ! -d ".venv" ]; then
    echo -e "${YELLOW}Creando entorno virtual .venv...${NC}"
    python3 -m venv .venv
    JUST_CREATED=true
fi

# Activar entorno virtual
source .venv/bin/activate

# 2. Instalar y actualizar dependencias
if [ "$JUST_CREATED" = true ] || [ "$1" = "--install" ] || [ "$1" = "--setup" ]; then
    echo -e "${YELLOW}Instalando/Actualizando dependencias desde requirements.txt...${NC}"
    pip install --upgrade pip
    pip install -r requirements.txt
else
    echo -e "${GREEN}✓ Entorno virtual activo (usa './run_backend.sh --install' si agregaste nuevas dependencias).${NC}"
fi

# 3. Validar archivo .env
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}Creando plantilla de configuración .env (completa tus llaves)...${NC}"
    cat <<EOF >.env
ASSISTANT_NAME="Aaron"
GEMINI_API_KEY="COPIA_AQUI_TU_GEMINI_API_KEY"
GOOGLE_API_KEY="COPIA_AQUI_TU_GOOGLE_MAPS_API_KEY"
PORT="8000"
VLM_MODEL="gemini-2.5-flash"
EOF
    echo -e "${RED}⚠️  Se ha creado el archivo .env en '$(pwd)/.env'. Por favor coloca tus llaves de API de Gemini y Google Maps allí antes de continuar.${NC}"
else
    echo -e "${GREEN}✓ Archivo .env detectado.${NC}"
fi

# Obtener IP local de la Mac
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -n "$LOCAL_IP" ]; then
    echo -e "${GREEN}✓ Servidor accesible en tu red Wi-Fi local en: wss://${LOCAL_IP}:8000/ws/video${NC}"
else
    echo -e "${RED}⚠️  No se pudo detectar tu dirección IP Wi-Fi local. Asegúrate de estar conectado a la misma red que tu iPhone.${NC}"
fi

# 4. Levantar servidor FastAPI
echo -e "${BLUE}Levantando servidor FastAPI en 0.0.0.0:8000 (presiona Ctrl+C para detener)...${NC}"
export PYTHONWARNINGS="ignore"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
