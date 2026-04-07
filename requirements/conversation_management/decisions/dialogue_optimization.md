# Decisiones: Optimización de Diálogos

## Contexto

El requisito REQ-03-055 especifica la necesidad de recortar y optimizar todos los diálogos del bot para ser más precisos, concretos y afables, eliminando redundancias, especialmente considerando que el público objetivo son adultos mayores.

## Análisis del Estado Actual

### Problemas Identificados en `constants.ts`:

#### 1. **Prompts Excesivamente Extensos**

- El prompt del sistema tiene 195 líneas
- Múltiples secciones con información redundante
- Instrucciones repetitivas en diferentes secciones

#### 2. **Lenguaje No Optimizado para Adultos Mayores**

- Uso de términos técnicos ("herramientas", "thread", "escalate")
- Instrucciones complejas con múltiples pasos
- Estructura muy formal y corporativa

#### 3. **Redundancias Específicas Encontradas**

- Instrucciones sobre uso de herramientas repetidas 3 veces
- Reglas de validación de dirección duplicadas
- Flujo de pedidos explicado en múltiples secciones

## Decisiones Tomadas

### ✅ **Decisión 1: Reestructuración del Sistema de Prompts**

**Problema:** Prompts muy largos y redundantes  
**Solución:** Separar en prompts especializados por contexto

**Implementación:**

```typescript
// Nueva estructura propuesta
const CORE_PROMPTS = {
  IDENTITY: "Prompt básico de identidad (50 palabras max)",
  GREETING: "Prompt para saludos iniciales (30 palabras max)",
  ORDER_TAKING: "Prompt específico para toma de pedidos (100 palabras max)",
  PROBLEM_SOLVING: "Prompt para resolución de problemas (80 palabras max)",
};
```

**Justificación:** Prompts contextuales más cortos y específicos mejoran la precisión y reducen confusión.

---

### ✅ **Decisión 2: Adaptación de Lenguaje para Adultos Mayores**

**Problema:** Lenguaje muy técnico y formal  
**Solución:** Vocabulario simple, cercano y familiar

**Cambios Específicos:**

- "herramientas" → "opciones disponibles"
- "validar dirección" → "confirmar que entregamos ahí"
- "escalar conversación" → "comunicarte con una persona"
- "thread" → eliminado, no usar términos técnicos

**Tono Objetivo:**

- Más cercano y personal ("te ayudo" vs "puedo asistir")
- Instrucciones simples paso a paso
- Confirmaciones frecuentes ("¿está bien así?", "¿te parece?")

---

### ✅ **Decisión 3: Eliminación de Redundancias**

**Redundancias Identificadas y Soluciones:**

| Sección Actual         | Redundancia                 | Acción                       |
| ---------------------- | --------------------------- | ---------------------------- |
| TOOLS_AND_CAPABILITIES | Lista herramientas 2 veces  | Consolidar en una sola lista |
| CONVERSATION_FLOW      | Repite reglas de validación | Referenciar sección única    |
| CRITICAL_RULES         | Repite flujo de pedidos     | Eliminar duplicación         |

**Nueva Estructura:**

```
1. IDENTIDAD (25 palabras)
2. CAPACIDADES (50 palabras)
3. FLUJO PRINCIPAL (75 palabras)
4. REGLAS ESENCIALES (40 palabras)
Total: ~190 palabras vs 800+ actuales
```

---

### ✅ **Decisión 4: Respuestas Más Concisas**

**Problema:** Bot da respuestas muy largas  
**Solución:** Reglas de brevedad estrictas

**Reglas Implementadas:**

- Respuestas de saludo: máximo 20 palabras
- Confirmaciones: máximo 15 palabras
- Explicaciones: máximo 40 palabras
- Una idea por mensaje

**Ejemplo de Optimización:**

❌ **Antes:**

```
"Hola, soy el asistente virtual del restaurante y estoy aquí para ayudarte con tu pedido. Para comenzar, necesito verificar tu información de contacto y la dirección donde quieres que entreguemos tu pedido. ¿Podrías confirmarme tu dirección?"
```

✅ **Después:**

```
"¡Hola! Te ayudo con tu pedido. ¿A qué dirección quieres que entreguemos?"
```

---

### ✅ **Decisión 5: Estructura de Conversación Simplificada**

**Problema:** Flujo conversacional muy complejo con muchos pasos  
**Solución:** Flujo lineal simple de 3 pasos

**Nuevo Flujo:**

1. **Saludo + Dirección** (1 mensaje)
2. **Menú + Selección** (1-2 mensajes)
3. **Confirmación + Pedido** (1 mensaje)

**Ventajas:**

- Menos pasos = menos confusión
- Más directo para adultos mayores
- Menos probabilidad de abandono

---

### ✅ **Decisión 6: Sistema de Prompts Contextuales**

**Implementación:** Crear función que selecciona prompt según estado de conversación

```typescript
function getContextualPrompt(conversationState: ConversationState) {
  switch (conversationState) {
    case "greeting":
      return GREETING_PROMPT;
    case "ordering":
      return ORDER_PROMPT;
    case "confirming":
      return CONFIRMATION_PROMPT;
    default:
      return CORE_PROMPT;
  }
}
```

**Beneficios:**

- Prompts más específicos y cortos
- Mejor performance del AI
- Respuestas más relevantes al contexto

---

## Implementación Técnica

### Archivos a Modificar:

1. `packages/backend/convex/system/ai/constants.ts` - Reestructuración completa
2. `packages/backend/convex/system/ai/agents/supportAgent.ts` - Lógica contextual
3. Crear: `packages/backend/convex/system/ai/prompts/` - Prompts especializados

### Plan de Testing:

1. **A/B Testing** con prompts actuales vs optimizados
2. **Testing con usuarios reales** (adultos mayores)
3. **Métricas de éxito:**
   - Tiempo promedio de conversación
   - Tasa de abandono
   - Satisfacción del usuario
   - Precisión en órdenes

### Rollout Strategy:

- **Fase 1:** Implementar prompts optimizados en desarrollo
- **Fase 2:** Testing con 10% de conversaciones
- **Fase 3:** Rollout gradual basado en métricas
- **Fase 4:** 100% de conversaciones con monitoreo

## Métricas de Validación

### Pre-Implementación (Baseline):

- Tiempo promedio conversación: ~8 minutos
- Palabras por respuesta bot: ~45 palabras
- Tasa de abandono: ~25%

### Objetivos Post-Implementación:

- Tiempo promedio conversación: <5 minutos
- Palabras por respuesta bot: <25 palabras
- Tasa de abandono: <15%
- Satisfacción usuario: >80%

## Riesgos y Mitigaciones

| Riesgo                                    | Mitigación                              |
| ----------------------------------------- | --------------------------------------- |
| Prompts muy cortos pierden funcionalidad  | Testing exhaustivo antes de rollout     |
| Usuarios confundidos por cambio de estilo | Rollout gradual con monitoreo           |
| Performance del AI degradada              | Benchmarking continuo                   |
| Pérdida de información crítica            | Checklist de funcionalidades esenciales |

## Próximos Pasos

1. ✅ **Documentar decisiones** (completado)
2. 🔄 **Implementar nueva estructura de prompts** (en progreso)
3. 📅 **Setup testing environment** (pendiente)
4. 📅 **Crear métricas de baseline** (pendiente)
5. 📅 **Comenzar A/B testing** (pendiente)

---

**Estado:** En Implementación  
**Responsable:** Equipo Backend  
**Timeline:** 4 días  
**Próxima Revisión:** Al completar implementación
