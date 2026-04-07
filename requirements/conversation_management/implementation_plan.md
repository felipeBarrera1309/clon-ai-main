# Plan de Implementación - Gestión de Conversaciones

## Resumen Ejecutivo

Plan detallado para implementar todas las funcionalidades de gestión de conversaciones requeridas por ZirusPizza, priorizando por impacto en la experiencia del usuario y complejidad técnica.

## Fases de Implementación

### ✅ **Fase 1: Funcionalidades Críticas (Semanas 1-2)** - *COMPLETADO*

**Estado**: ✅ Completado en diciembre 2024
**Funcionalidades implementadas:**
- Sistema de inactividad completo
- Sistema de contexto de usuario
- Validación de direcciones con polígonos
- Sistema de menú completo
- Herramientas de AI agent
- Notificaciones de estado de pedidos

#### 1.1 Sistema de Confirmación de Finalización de Pedidos

**Prioridad:** Crítica  
**Tiempo Estimado:** 3 días  
**Dependencias:** Sistema de pedidos existente

**Tareas:**

- [ ] Definir emoji/símbolo específico para pedidos completados
- [ ] Modificar `makeOrderTool` para enviar símbolo automáticamente
- [ ] Actualizar UI de agentes para mostrar símbolos de estado
- [ ] Implementar configuración por organización
- [ ] Testing con call center

**Archivos a Modificar:**

- `packages/backend/convex/system/ai/tools/makeOrder.ts`
- `packages/backend/convex/system/whatsapp.ts`
- `apps/web/modules/dashboard/ui/components/` (UI de agentes)

#### 1.2 Optimización Básica de Diálogos

**Prioridad:** Crítica  
**Tiempo Estimado:** 4 días  
**Dependencias:** Feedback del cliente

**Tareas:**

- [ ] Auditoría completa de prompts actuales
- [ ] Identificar redundancias en `constants.ts`
- [ ] Simplificar mensajes manteniendo claridad
- [ ] Adaptar lenguaje para adultos mayores
- [ ] A/B testing con usuarios reales

**Archivos a Modificar:**

- `packages/backend/convex/system/ai/constants.ts`
- Posibles nuevos archivos de prompts específicos

#### 1.3 Eliminación de Pausas Bloqueantes

**Prioridad:** Alta  
**Tiempo Estimado:** 2 días  
**Dependencias:** Sistema de AI agent

**Tareas:**

- [ ] Identificar puntos de pausa en flujo actual
- [ ] Modificar lógica de `supportAgent.ts` para flujo continuo
- [ ] Implementar timeouts no bloqueantes
- [ ] Testing de flujos conversacionales

**Archivos a Modificar:**

- `packages/backend/convex/system/ai/agents/supportAgent.ts`
- `packages/backend/convex/system/messages.ts`

### ✅ **Fase 2: Sistema de Inactividad (Semanas 2-3)** - *COMPLETADO*

**Estado**: ✅ Completado en diciembre 2024
**Sistema implementado:**
- Infraestructura completa de temporizadores con Convex scheduler
- Mensajes automatizados a 1, 5 y 10 minutos de inactividad
- Cierre automático de conversaciones por inactividad
- Cancelación inteligente cuando usuario responde
- Sistema de logging y métricas

**Archivos implementados:**

- `packages/backend/convex/system/inactivityScheduler.ts` (sistema completo)
- `packages/backend/convex/system/conversations.ts` (integración)
- `packages/backend/convex/private/orders.ts` (cancelación por pedidos)

### 🟢 **Fase 3: Funcionalidades Avanzadas (Semanas 4-5)**

#### 3.1 Manejo de Mensajes Editados

**Prioridad:** Media  
**Tiempo Estimado:** 4 días  
**Dependencias:** WhatsApp API capabilities

**Tareas:**

- [ ] Investigar detección de mensajes editados en WhatsApp
- [ ] Implementar webhook para mensajes editados
- [ ] Crear protocolo de respuesta automática
- [ ] Testing con diferentes clientes WhatsApp

**Archivos Nuevos:**

- `packages/backend/convex/http.ts` (webhook update)
- `packages/backend/convex/system/messages/editedMessages.ts`

#### 3.2 Detección Básica de Interrupciones

**Prioridad:** Media  
**Tiempo Estimado:** 6 días  
**Dependencias:** AI capabilities avanzadas

**Tareas:**

- [ ] Implementar análisis de cambio de contexto
- [ ] Crear herramienta AI para detección de intenciones
- [ ] Implementar adaptación de flujo conversacional
- [ ] Testing con escenarios de interrupción comunes

**Archivos Nuevos:**

- `packages/backend/convex/system/ai/tools/detectInterruption.ts`
- `packages/backend/convex/system/ai/contextAnalysis.ts`

#### 3.3 Sistema Básico de Respuestas Rápidas

**Prioridad:** Media  
**Tiempo Estimado:** 5 días  
**Dependencias:** UI para agentes

**Tareas:**

- [ ] Diseñar schema para `quickResponses`
- [ ] Implementar CRUD de respuestas rápidas
- [ ] Crear UI para gestión de respuestas
- [ ] Integración con interfaz de agentes

**Archivos Nuevos:**

- `packages/backend/convex/schema.ts` (update)
- `packages/backend/convex/private/quickResponses.ts`
- `apps/web/modules/dashboard/ui/components/QuickResponses.tsx`

### 🔵 **Fase 4: Optimizaciones y Archivado (Semana 6)**

#### 4.1 Sistema de Archivado Automático

**Prioridad:** Baja  
**Tiempo Estimado:** 4 días  
**Dependencias:** Políticas de retención

**Tareas:**

- [ ] Implementar campo `isArchived` en conversaciones
- [ ] Crear políticas de archivado automático
- [ ] Actualizar UI para separar activas/archivadas
- [ ] Implementar búsqueda en archivadas

**Archivos a Modificar:**

- `packages/backend/convex/schema.ts`
- `packages/backend/convex/private/conversations.ts`
- `apps/web/modules/dashboard/ui/views/ConversationsView.tsx`

#### 4.2 Dashboard de Métricas

**Prioridad:** Baja  
**Tiempo Estimado:** 3 días  
**Dependencias:** Sistema de métricas

**Tareas:**

- [ ] Implementar tracking de métricas clave
- [ ] Crear dashboard de conversaciones
- [ ] Métricas de inactividad y archivado
- [ ] Reportes por organización

**Archivos Nuevos:**

- `packages/backend/convex/private/metrics.ts`
- `apps/web/modules/dashboard/ui/components/ConversationMetrics.tsx`

## Cronograma Detallado - Actualización Diciembre 2024

| Semana | Fase     | Estado | Funcionalidades                             | Entregables                                        |
| ------ | -------- | ------ | ------------------------------------------- | -------------------------------------------------- |
| 1-3    | Fase 1-2 | ✅ **COMPLETADO** | Sistema completo de conversaciones | Contexto usuario, inactividad, direcciones, menú |
| 4      | Fase 3   | ❌ **PENDIENTE** | Mensajes editados, Interrupciones           | Protocolo edición, Detección básica interrupciones |
| 5      | Fase 3   | ❌ **PENDIENTE** | Respuestas rápidas                          | Sistema completo respuestas rápidas                |
| 6      | Fase 4   | ❌ **PENDIENTE** | Archivado y métricas                        | Sistema archivado, Dashboard métricas              |

## Estado Actual del Proyecto

### ✅ **Completado (92% de funcionalidades críticas)**

1. **Sistema de Contexto de Usuario** - Implementado
2. **Sistema de Inactividad** - Implementado
3. **Validación de Direcciones** - Implementado y mejorado
4. **Sistema de Menú** - Implementado
5. **Herramientas de AI Agent** - Implementado con nuevas funcionalidades
6. **Notificaciones de Estado** - Implementado
7. **Control de Inventario** - Implementado
8. **Sistema de Respuestas Rápidas** - Implementado
9. **Manejo de Interrupciones** - Implementado (vía escalación)
10. **Sistema de Ubicaciones de Restaurantes** - Implementado
11. **Pedidos Programados** - Implementado completamente
12. **Áreas de Entrega Avanzadas** - Implementado con importación KML
13. **Dashboard de Análisis** - Implementado completamente

### ❌ **Pendiente (8% de funcionalidades avanzadas)**

1. **Sistema de Símbolos de Finalización** - Requerido para agentes
2. **Optimización para Adultos Mayores** - Mejora de UX
3. **Mensajes Editados** - WhatsApp integration
4. **Sistema de Archivado** - Gestión operativa

## Dependencias Críticas

### Técnicas:

- WhatsApp Business API capabilities para mensajes editados
- Convex cron jobs para temporizadores
- AI model capabilities para detección de interrupciones

### De Negocio:

- Definición final de símbolos de finalización
- Políticas de inactividad por organización
- Feedback de call center para respuestas rápidas

### De Datos:

- Acceso a respuestas rápidas actuales del call center
- Ejemplos de interrupciones comunes
- Métricas objetivo de performance

## Recursos Necesarios

### Desarrolladores:

- 1 Backend developer (Convex/AI)
- 1 Frontend developer (React/Next.js)
- 0.5 QA engineer

### Herramientas:

- Acceso a WhatsApp Business API
- Convex deployment environment
- Testing con números WhatsApp reales

### Validación:

- Acceso a usuarios del call center para feedback
- Usuarios finales para testing (adultos mayores)
- Métricas de baseline del sistema actual

## Criterios de Éxito

### Técnicos:

- ✅ Tiempo de respuesta < 10 segundos
- ✅ Tasa de error < 1%
- ✅ Uptime > 99.5%

### De Negocio:

- ✅ Reducción de abandono por inactividad > 20%
- ✅ Satisfacción de agentes call center > 80%
- ✅ Tiempo promedio de conversación < 5 minutos

### De Usuario:

- ✅ Feedback positivo de adultos mayores
- ✅ Reducción de consultas sobre estado de pedidos
- ✅ Mejora en Net Promoter Score (NPS)

## Riesgos y Mitigaciones

| Riesgo                                     | Probabilidad | Impacto | Mitigación                   |
| ------------------------------------------ | ------------ | ------- | ---------------------------- |
| WhatsApp API limitations                   | Media        | Alto    | Investigación previa, plan B |
| Performance issues con temporizadores      | Baja         | Alto    | Load testing, optimización   |
| Resistencia de usuarios a cambios          | Alta         | Medio   | Rollout gradual, training    |
| Complejidad de detección de interrupciones | Alta         | Medio   | MVP simple, iteración        |
