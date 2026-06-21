# Asistente Integral Multi-Capa para Personas con Discapacidad Visual (Glasses Watch)

## Visión del Proyecto
Este proyecto es una plataforma de asistencia continua diseñada para personas con discapacidad visual o pérdida parcial de visión. Funciona a través de un ecosistema de agentes inteligentes que procesan el entorno físico y digital del usuario en tiempo real. 

A través de la integración de telemetría, datos biométricos (como los de un smartwatch) y descripciones visuales/auditivas (provenientes de hardware como las Meta Ray-Ban), el asistente interpreta el mundo y entrega información vital por audio. Toda la asistencia se rige bajo los más altos estándares clínicos y de accesibilidad (Directrices de la EBU y AFB), garantizando autonomía, seguridad y un trato 100% digno y no condescendiente.

---

## Filosofía y Directrices Core
Nuestra arquitectura se sostiene sobre la "Regla de Oro": **Cero Alucinaciones y Cero Invenciones**.
El agente no toma decisiones por el usuario ni emite diagnósticos médicos. Su rol es actuar como un **Guía Vidente Virtual** (Sighted Guide), proporcionando la información espacial, geométrica y situacional que falta, para que el usuario sea quien mantenga el control total de su entorno.

---

## 🚀 EPIC: Funcionalidades y Ecosistema de Agentes

El ecosistema se divide en flujos de usuario (User Flows) que son gestionados por una arquitectura de enjambre (*swarm architecture*) compuesta por 6 Agentes Especializados (System Prompts):

### 1. Movilidad y Orientación Física
*   **Navegación Asistida:** Guía paso a paso en cruces de calles. El agente identifica semáforos, bordillos y tráfico cruzado, alertando objetivamente sobre peligros físicos sin usar lenguaje directivo ("cruza ahora").
*   **Reconocimiento de Entorno:** Funciones de *Onboarding Espacial* para mapear la geometría de lugares nuevos y alertar sobre cambios u obstáculos inesperados en espacios habituales.
*   **Agente a cargo:** *Spatial Mobility Guide*

### 2. Salud Mental y Prevención
*   **Prevención de Ataques de Pánico:** A través de la lectura de biometría y decibeles ambientales, el sistema detecta detonantes de estrés. Ofrece pausas de seguridad y ejercicios de *grounding* (enraizamiento) mitigando el efecto nocebo.
*   **Agente a cargo:** *Clinical Grounding Support*

### 3. Personalización y Memoria
*   **Banco de Información RAG:** Una memoria local que reconoce a familiares/contactos y recuerda rutas habituales para evitar depender de la nube en situaciones de necesidad inmediata.
*   **Agente a cargo:** *RAG Memory Contextualizer*

### 4. Seguridad y Triage en Crisis
*   **Protocolo de Emergencias:** Un agente en la sombra que monitorea datos críticos (caídas, fuego). Al detectar peligro inminente, emite alertas automáticas para que el dispositivo móvil llame al 911 y comparta la ubicación por GPS a la red de soporte.
*   **Agente a cargo:** *Emergency Triage Override*

### 5. Accesibilidad Digital
*   **Uso de Computadora Manos Libres:** Actúa como un puente entre la voz del usuario y agentes de control de escritorio (como Open Claw o Hermes). Permite gestionar correos y calendarios en lenguaje natural, eliminando la fatiga cognitiva de los lectores de pantalla tradicionales.
*   **Agente a cargo:** *Digital Bridge Desktop Assistant*

### 6. Asistencia en Retail y Supermercados
*   **Modo Compras (Shopper Swarm):** Sub-arquitectura para la navegación en supermercados. El Orquestador delega el control a un *Shopper Orchestrator* que, con sus agentes hijos, verifica listas de compra, propone rutas sin imponerlas, navega de forma adaptativa y guía al usuario para enfocar correctamente los productos y leer datos microscópicos (caducidad, marcas).
*   **Agentes a cargo:** *Shopper Orchestrator, Aisle Navigator, Product Inspector, Shopping List Manager*

### 7. Orquestación Central
*   **El Enrutador:** El *Sighted Guide Orchestrator* recibe todos los inputs de hardware. Es el único que habla con el usuario, delegando silenciosamente la carga cognitiva a los subagentes pertinentes para mantener una latencia casi nula.
