# Templates Hermes-lite — Puente

Copiar a backend o filesystem en deploy. No commitear datos reales de usuarios.

---

## USER.md

```markdown
# Perfil usuario
- Id: maria_demo
- Discapacidad: baja visión total (dominio Washington: ver)
- Idioma: es-MX
- TTS velocidad: normal
- Dominios activos: vision, mobility
- Marca leche: Lala deslactosada
- Super habitual: Walmart Portales
```

---

## MEMORY.md

```markdown
# Memoria Puente
- Prefiere confirmación voz antes de marcar item comprado
- Evita marcas genéricas leche si hay Lala
- Primera visita indexada: pendiente
```

---

## Skill: super-shopping-mx

```markdown
# Procedimiento: compra super México
1. Cargar lista por voz en casa
2. Modo Sentido al entrar
3. RAG si visita 2+; visión si visita 1
4. PTT para confirmar cada producto
5. Hermes recall "¿qué me falta?" mid-session
6. Al salir: indexar layout + resumen MEMORY
```
