# Gestión de Conversaciones - Requisitos ZirusPizza

## Resumen

Esta área cubre todas las funcionalidades relacionadas con el manejo inteligente de conversaciones entre el bot y los clientes, optimizando la experiencia conversacional y la eficiencia operativa.

## Requisitos Específicos

### 1. Sistema de Gestión de Inactividad del Cliente

**ID Requisito:** REQ-03-053  
**Prioridad:** Alta  
**Descripción:** Implementar secuencia automatizada que envíe mensaje "HOLA ESTAS AHÍ" a los 3, 5 y 10 minutos de inactividad, cerrando la conversación si no hay respuesta.

**Criterios de Aceptación:**

- [ ] Sistema detecta inactividad del cliente automáticamente
- [ ] Envío de mensaje a los 3 minutos de inactividad
- [ ] Envío de mensaje a los 5 minutos de inactividad
- [ ] Envío de mensaje a los 10 minutos de inactividad
- [ ] Cierre automático de conversación después del último mensaje sin respuesta
- [ ] Notificación al agente sobre cierre por inactividad
- [ ] Configuración de tiempos por organización

**Justificación:** Libera recursos del sistema y evita conversaciones abandonadas que consuman capacidad.

---

### 2. Optimización de Diálogos

**ID Requisito:** REQ-03-055  
**Prioridad:** Alta  
**Descripción:** Recortar y optimizar todos los diálogos del bot para ser más precisos, concretos y afables, eliminando redundancias.

**Criterios de Aceptación:**

- [ ] Análisis de diálogos actuales del bot
- [ ] Identificación de redundancias en prompts del sistema
- [ ] Simplificación de respuestas manteniendo información necesaria
- [ ] Tono más afable y directo
- [ ] Tiempo de respuesta del bot optimizado
- [ ] Validación con usuarios reales (adultos mayores)

**Justificación:** Mejora la experiencia de usuario y reduce tiempos de conversación.

---

### 3. Eliminación de Pausas en Conversación

**ID Requisito:** REQ-03-059  
**Prioridad:** Media  
**Descripción:** Eliminar escenarios donde el bot se "pausa" esperando respuesta del usuario, permitiendo continuación fluida de la conversación.

**Criterios de Aceptación:**

- [ ] Identificación de puntos de pausa en el flujo actual
- [ ] Implementación de flujo continuo sin esperas bloqueantes
- [ ] Bot mantiene contexto durante pausas naturales
- [ ] Capacidad de reanudar conversación en cualquier momento
- [ ] No hay estados "colgados" del bot

**Justificación:** Evita que el bot parezca "colgado" y mejora la percepción de eficiencia.

---

### 4. Manejo de Interrupciones en Tiempo Real

**ID Requisito:** REQ-03-063  
**Prioridad:** Alta  
**Descripción:** Desarrollar capacidad para que el bot reconozca intenciones del usuario cuando este interrumpe o cambia drásticamente el tema de conversación.

**Criterios de Aceptación:**

- [ ] Detección de cambios abruptos de tema
- [ ] Reconocimiento de intenciones cuando el usuario interrumpe
- [ ] Adaptación del flujo conversacional según nueva intención
- [ ] Mantenimiento de contexto previo cuando sea relevante
- [ ] Capacidad de retomar tema anterior si es necesario

**Justificación:** Permite conversaciones más naturales y reduce frustración del usuario.

---

### 5. Manejo de Mensajes Editados

**ID Requisito:** REQ-28-279  
**Prioridad:** Media  
**Descripción:** Crear protocolo para cuando clientes editan mensajes, indicándoles que deben enviar un mensaje nuevo con la información correcta.

**Criterios de Aceptación:**

- [ ] Detección de mensajes editados en WhatsApp
- [ ] Mensaje automático indicando política de mensajes editados
- [ ] Instrucciones claras para enviar mensaje nuevo
- [ ] Prevención de procesamiento de información obsoleta
- [ ] Logging de mensajes editados para análisis

**Justificación:** Evita confusión y asegura que la información procesada sea la correcta.

---

### 6. Sistema de Respuestas Rápidas

**ID Requisito:** REQ-19-267, REQ-38-455  
**Prioridad:** Media  
**Descripción:** Adaptar y mejorar las respuestas rápidas que actualmente usa el call center para uso tanto del bot como de agentes humanos.

**Criterios de Aceptación:**

- [ ] Base de datos de respuestas rápidas categorizadas
- [ ] Integración con interfaz de agentes humanos
- [ ] Templates personalizables por organización
- [ ] Sistema de búsqueda de respuestas rápidas
- [ ] Métricas de uso de respuestas rápidas
- [ ] Capacidad de agregar nuevas respuestas rápidas

**Justificación:** Mantiene consistencia en comunicación y acelera respuestas.

---

### 7. Archivado Automático de Conversaciones

**ID Requisito:** REQ-16-243  
**Prioridad:** Media  
**Descripción:** Desarrollar sistema que archive automáticamente conversaciones completadas para evitar "contaminación visual" y permitir que agentes se enfoquen en casos activos.

**Criterios de Aceptación:**

- [ ] Archivado automático de conversaciones resueltas
- [ ] Separación visual entre conversaciones activas y archivadas
- [ ] Capacidad de búsqueda en conversaciones archivadas
- [ ] Políticas de retención configurables
- [ ] Restauración de conversaciones archivadas si es necesario
- [ ] Dashboard con métricas de conversaciones archivadas

**Justificación:** Mejora eficiencia operativa y reduce confusión en la interfaz de agentes.

---

### 8. Confirmación de Finalización de Pedidos

**ID Requisito:** REQ-03-039  
**Prioridad:** Alta  
**Descripción:** Implementar un sistema donde al finalizar cada conversación se envíe un emoji específico que indique claramente al agente del call center que el pedido está cerrado y procesado.

**Criterios de Aceptación:**

- [ ] Definición de emoji o símbolo específico para pedidos completados
- [ ] Envío automático del símbolo al completar pedido
- [ ] Visibilidad del símbolo para agentes del call center
- [ ] Diferenciación entre pedidos completados y conversaciones cerradas sin pedido
- [ ] Configuración de símbolos por organización

**Justificación:** Proporciona una señal visual clara que evita confusiones sobre el estado de los pedidos.

---

## Dependencias

- Sistema de AI Agent (existente)
- WhatsApp Business API (existente)
- Sistema de pedidos (existente)
- Dashboard administrativo (en desarrollo)

## Consideraciones Técnicas

- Compatible con WhatsApp Business API
- Optimizado para adultos mayores (público objetivo principal)
- Respuestas en menos de 10 segundos
- Manejo de sesiones concurrentes
- Escalabilidad para múltiples organizaciones

## Métricas de Éxito

- Tiempo promedio de conversación < 5 minutos
- Tasa de abandono por inactividad < 15%
- Satisfacción del usuario > 80%
- Tiempo de respuesta del bot < 10 segundos
- Reducción de carga en call center > 40%
