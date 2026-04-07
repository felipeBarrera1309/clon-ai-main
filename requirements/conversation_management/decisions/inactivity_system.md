# Decisiones: Sistema de Gestión de Inactividad

## Contexto

El requisito REQ-03-053 especifica implementar secuencia automatizada que envíe mensaje "HOLA ESTAS AHÍ" a los 3, 5 y 10 minutos de inactividad, cerrando la conversación si no hay respuesta.

## Análisis de Requerimientos

### Comportamiento Esperado:

1. **T+3min:** Primer mensaje de inactividad
2. **T+5min:** Segundo mensaje de inactividad
3. **T+7min:** Tercer mensaje + cierre automático si no responde
4. **Reset:** Si el usuario responde en cualquier momento, reiniciar timer

### Consideraciones Técnicas:

- Múltiples conversaciones concurrentes
- Timer debe sobrevivir a reinicios del sistema
- Configuración por organización
- Integración con WhatsApp API

## Decisiones Arquitecturales

### ✅ **Decisión 1: Arquitectura de Temporizadores**

**Problema:** ¿Cómo manejar temporizadores persistentes en serverless?
**Solución:** Sistema de scheduling de funciones basado en tiempo usando Convex scheduler

**Implementación:**

```typescript
// Sistema de scheduling basado en tiempo
const scheduleInactivityMessage = async (
  conversationId: Id<"conversations">,
  delayMinutes: number,
  stage: "3min" | "5min" | "7min"
) => {
  await ctx.scheduler.runAfter(
    delayMinutes * 60 * 1000, // Convertir minutos a milisegundos
    "system.inactivity.sendMessage",
    {
      conversationId,
      stage,
      organizationId: ctx.auth.getOrganizationId(),
    }
  );
};
```

**Justificación:**

- ✅ Más eficiente que polling con cron jobs
- ✅ Ejecución exacta en el tiempo programado
- ✅ No requiere tabla adicional de timers
- ✅ Mejor performance y menor costo

---

### ✅ **Decisión 3: Mensajes de Inactividad**

**Problema:** ¿Qué mensajes exactos enviar?  
**Solución:** Mensajes personalizables por organización con defaults

**Mensajes Default:**

- **3 minutos:** "¿Sigues ahí? Te ayudo con tu pedido 😊"
- **5 minutos:** "Hola, ¿necesitas ayuda con algo más?"
- **7 minutos:** "Cerramos esta conversación por inactividad. Escríbenos cuando quieras hacer un pedido."

**Configuración:**

```typescript
// En agentConfiguration table
inactivityMessages: {
  message3min: v.string(),
  message5min: v.string(),
  message7min: v.string(),
  isEnabled: v.boolean(),
}
```

**Justificación:**

- Tono amigable y no intrusivo
- Progresión lógica: ayuda → checking → cierre
- Personalizable por marca/organización

---

### ✅ **Decisión 4: Comportamiento de Reset**

**Problema:** ¿Cuándo y cómo reiniciar el timer?  
**Solución:** Reset en cualquier mensaje del usuario, no del bot

**Lógica de Reset:**

```typescript
// En cada mensaje del usuario
const resetInactivityTimer = async (conversationId: Id<"conversations">) => {
  // Cancelar jobs programados existentes para esta conversación
  await ctx.scheduler.cancelJobs({
    conversationId,
  });

  // Programar nuevos mensajes de inactividad
  await Promise.all([
    scheduleInactivityMessage(conversationId, 3, "3min"),
    scheduleInactivityMessage(conversationId, 5, "5min"),
    scheduleInactivityMessage(conversationId, 7, "7min"),
  ]);
};
```

**Comportamientos de Reset:**

- ✅ Mensaje de texto del usuario
- ✅ Imagen enviada por usuario
- ✅ Audio enviado por usuario
- ❌ Mensajes del bot (no resetean)
- ❌ Mensajes de sistema (no resetean)

---

### ✅ **Decisión 5: Integración con Estados de Conversación**

**Problema:** ¿En qué estados de conversación aplicar inactividad?  
**Solución:** Solo en conversaciones "unresolved"

**Estados y Comportamiento:**

- **unresolved:** ✅ Aplicar sistema de inactividad
- **escalated:** ❌ No aplicar (manejo humano)
- **resolved:** ❌ No aplicar (ya cerrada)

**Lógica:**

```typescript
const shouldApplyInactivity = (conversation: Doc<"conversations">) => {
  return conversation.status === "unresolved" && !conversation.isArchived;
};
```

---

### ✅ **Decisión 6: Notificaciones a Agentes**

**Problema:** ¿Cómo notificar a agentes sobre cierres por inactividad?  
**Solución:** Log en dashboard + notificación opcional

**Implementación:**

```typescript
// Crear evento de sistema
await ctx.db.insert("systemEvents", {
  type: "conversation_closed_inactivity",
  conversationId: conversation._id,
  organizationId: conversation.organizationId,
  metadata: {
    lastActivity: timer.lastActivity,
    totalTime: Date.now() - timer.lastActivity,
  },
});
```

**Notificaciones:**

- Dashboard: Log visible para agentes
- Opcional: Notificación en tiempo real
- Métricas: Tracking para análisis

---

### ✅ **Decisión 7: Manejo de Edge Cases**

**Edge Cases Identificados y Soluciones:**

| Caso                                    | Solución                              |
| --------------------------------------- | ------------------------------------- |
| Usuario responde justo antes del cierre | Reset timer, continuar conversación   |
| Sistema se reinicia durante timer       | Timer persiste en DB, se retoma       |
| WhatsApp API falla al enviar            | Retry logic + logging                 |
| Conversación escalada durante timer     | Cancelar timer automáticamente        |
| Usuario bloquea el bot                  | Cancelar timer, marcar como bloqueado |

**Retry Logic para WhatsApp:**

```typescript
const sendInactivityMessage = async (
  message: string,
  phoneNumber: string,
  retries = 3,
) => {
  for (let i = 0; i < retries; i++) {
    try {
      await sendWhatsAppMessage(message, phoneNumber);
      return true;
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1)); // exponential backoff
    }
  }
};
```

---

## Implementación Técnica

### Nuevos Archivos a Crear:

1. **`packages/backend/convex/system/inactivity/`**

   ```
   ├── scheduler.ts       # Funciones de scheduling para mensajes
   ├── messages.ts        # Envío de mensajes de inactividad
   ├── handler.ts         # Handler para jobs programados
   └── utils.ts           # Utilidades para gestión de inactividad
   ```

2. **Schema Updates:** No se requiere nueva tabla - se utiliza el scheduler de Convex

### Archivos a Modificar:

1. **`packages/backend/convex/system/messages.ts`**
   - Agregar reset de timer en cada mensaje del usuario

2. **`packages/backend/convex/system/conversations.ts`**
   - Integrar creación de timer al crear conversación
   - Cancelar timer al escalar/resolver

3. **`packages/backend/convex/system/ai/agents/supportAgent.ts`**
   - Opcional: Agregar contexto sobre inactividad

### Configuración por Organización:

```typescript
// En agentConfiguration
export const updateInactivityConfig = mutation({
  args: {
    organizationId: v.id("organizations"),
    config: v.object({
      isEnabled: v.boolean(),
      message3min: v.optional(v.string()),
      message5min: v.optional(v.string()),
      message7min: v.optional(v.string()),
      customTimeouts: v.optional(
        v.object({
          first: v.number(), // default 3
          second: v.number(), // default 5
          third: v.number(), // default 7
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    // Implementación de configuración
  },
});
```

## Testing Strategy

### Unit Tests:

- ✅ Scheduler creation/reset logic
- ✅ Message sending logic
- ✅ Job execution and cancellation
- ✅ Edge cases handling

### Integration Tests:

- ✅ End-to-end inactivity flow
- ✅ WhatsApp integration
- ✅ Multiple concurrent timers
- ✅ System restart scenarios

### Load Tests:

- ✅ 1000+ concurrent timers
- ✅ Cron job performance
- ✅ Database query optimization

## Métricas y Monitoreo

### KPIs a Trackear:

- Número de conversaciones cerradas por inactividad/día
- Tiempo promedio hasta primer mensaje de inactividad
- Tasa de respuesta por stage (3min, 5min, 10min)
- Impacto en satisfacción del usuario

### Alerts:

- Fallas en envío de mensajes > 5%
- Cron job no ejecutándose > 2 minutos
- Timers acumulándose sin procesarse

### Dashboard Metrics:

```typescript
interface InactivityMetrics {
  totalTimersActive: number;
  closedByInactivityToday: number;
  responseRateByStage: {
    stage3min: number;
    stage5min: number;
    stage10min: number;
  };
  averageResponseTime: number;
}
```

## Rollout Plan

### Fase 1: Development (Semana 1)

- [ ] Implementar schema y funciones básicas
- [ ] Unit tests completos
- [ ] Testing en development environment

### Fase 2: Staging (Semana 2)

- [ ] Integration testing
- [ ] Load testing con datos simulados
- [ ] UI para configuración por organización

### Fase 3: Production (Semana 3)

- [ ] Rollout gradual: 10% de conversaciones
- [ ] Monitoreo intensivo por 48 horas
- [ ] Rollout completo si métricas son positivas

## Riesgos y Mitigaciones

| Riesgo                               | Probabilidad | Impacto | Mitigación                       |
| ------------------------------------ | ------------ | ------- | -------------------------------- |
| WhatsApp rate limiting               | Media        | Alto    | Implementar rate limiting propio |
| Performance issues con muchos timers | Baja         | Alto    | Load testing + optimización      |
| Usuarios molestos con mensajes       | Alta         | Medio   | A/B testing + configuración      |
| Cron jobs fallan silenciosamente     | Baja         | Alto    | Monitoring + alerting            |

---

**Estado:** Diseño Completado  
**Próximo Paso:** Implementación Fase 1  
**Responsable:** Backend Team  
**Estimación:** 5 días de desarrollo
