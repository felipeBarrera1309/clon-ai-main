# Sistema de Pedidos Programados - Requisitos

## Resumen Ejecutivo

El sistema de pedidos programados permite a los clientes programar pedidos para fechas y horas futuras, con validación automática de horarios de restaurante y activación automática cuando llega el momento programado.

## Estado de Implementación

### ✅ **COMPLETAMENTE IMPLEMENTADO**

**Fecha de Implementación**: Diciembre 2024  
**Estado**: Operativo en producción  
**Cobertura**: 100% de funcionalidades críticas

## Funcionalidades Implementadas

### 1. Programación de Pedidos Futuros

**Descripción**: Capacidad completa para que los clientes programen pedidos para fechas y horas específicas en el futuro.

**Implementación Técnica**:
- Herramienta AI: `scheduleOrderTool`
- Función backend: `createFromAiTool` (unified function for both immediate and scheduled orders)
- Estado específico: `"programado"`
- Campo `scheduledTime` en tabla `orders`

**Características**:
- Interpretación automática de hora colombiana desde formato ISO
- Validación de límites de tiempo (30 min mínimo, 7 días máximo)
- Integración completa con sistema de pedidos existente

### 2. Validación de Horarios de Restaurante

**Descripción**: Validación automática que verifica si el restaurante estará abierto en el horario programado.

**Implementación Técnica**:
- Función `isRestaurantOpen()` para verificación
- Integración con tabla `restaurantLocations`
- Validación de horarios de apertura por día

**Beneficios**:
- Previene pedidos en horarios de cierre
- Mensajes de error informativos
- Mejora experiencia del cliente

### 3. Activación Automática

**Descripción**: Sistema que activa automáticamente los pedidos programados cuando llega la hora especificada.

**Implementación Técnica**:
- Convex Scheduler para programar activación
- Función `activateScheduledOrder`
- Cambio automático de estado de `"programado"` a `"pendiente"`

**Proceso**:
1. Pedido se crea con estado `"programado"`
2. Se programa activación con `ctx.scheduler.runAt()`
3. En la hora programada, se ejecuta activación automática
4. Pedido pasa a cocina con estado `"pendiente"`

### 4. Modificación de Pedidos Programados

**Descripción**: Capacidad para modificar pedidos programados antes de que sean activados.

**Implementación Técnica**:
- Herramienta AI: `modifyScheduledOrderTool`
- Validación de estado `"programado"`
- Re-programación de activación automática

**Modificaciones Permitidas**:
- Cambio de fecha/hora programada
- Modificación de productos
- Actualización de dirección de entrega
- Cambio de método de pago

### 5. Cancelación de Pedidos Programados

**Descripción**: Sistema para cancelar pedidos programados con razones específicas.

**Implementación Técnica**:
- Herramienta AI: `cancelScheduledOrderTool`
- Cancelación de tareas programadas en Convex
- Registro de razón de cancelación

**Características**:
- Solo disponible para pedidos en estado `"programado"`
- Cancelación automática de activación programada
- Notificación al cliente sobre cancelación

## Integración con Herramientas de AI

### 1. scheduleOrderTool

**Propósito**: Crear pedidos programados desde conversaciones de AI.

**Parámetros**:
- `items`: Lista de productos con cantidades
- `deliveryAddress`: Dirección validada previamente
- `restaurantLocationId`: ID de la sucursal
- `paymentMethod`: Método de pago seleccionado
- `scheduledTime`: Fecha/hora en formato ISO

**Validaciones**:
- Dirección debe estar previamente validada
- Horario debe estar dentro de límites permitidos
- Restaurante debe estar disponible en horario programado

### 2. modifyScheduledOrderTool

**Propósito**: Modificar pedidos programados existentes.

**Capacidades**:
- Cambio de horario programado
- Modificación de productos
- Actualización de información de entrega

**Restricciones**:
- Solo pedidos en estado `"programado"`
- Validaciones similares a creación inicial

### 3. cancelScheduledOrderTool

**Propósito**: Cancelar pedidos programados con razón específica.

**Características**:
- Cancelación inmediata
- Registro de razón de cancelación
- Notificación automática al cliente

## Esquema de Base de Datos

### Modificaciones en Tabla Orders

```typescript
orders: defineTable({
  // ... campos existentes
  scheduledTime: v.optional(v.number()), // Timestamp para pedidos programados
  status: orderStatusValidator, // Incluye "programado"
})
.index("by_scheduled_time", ["scheduledTime"])
.index("by_organization_and_scheduled", ["organizationId", "scheduledTime"])
```

### Estados de Pedido

```typescript
export const orderStatusValidator = v.union(
  v.literal("programado"), // NUEVO: Para pedidos programados
  v.literal("pendiente"),
  v.literal("preparando"),
  v.literal("esperando_recogida"),
  v.literal("en_camino"),
  v.literal("entregado"),
  v.literal("cancelado")
);
```

## Flujo de Trabajo

### 1. Creación de Pedido Programado

1. **Cliente solicita pedido programado**
2. **AI valida información**:
   - Productos disponibles
   - Dirección validada
   - Método de pago confirmado
3. **Sistema valida horario**:
   - Límites de tiempo (30 min - 7 días)
   - Horarios de restaurante
4. **Creación del pedido**:
   - Estado: `"programado"`
   - Programación de activación automática
5. **Confirmación al cliente** con número de pedido

### 2. Activación Automática

1. **Convex Scheduler ejecuta tarea programada**
2. **Función `activateScheduledOrder` se ejecuta**
3. **Cambio de estado** de `"programado"` a `"pendiente"`
4. **Pedido entra al flujo normal** de cocina

### 3. Modificación (Opcional)

1. **Cliente solicita modificación**
2. **Validación de estado** (`"programado"`)
3. **Aplicación de cambios**
4. **Re-programación** de activación si cambió horario
5. **Confirmación** de modificación

### 4. Cancelación (Opcional)

1. **Cliente solicita cancelación**
2. **Validación de estado** (`"programado"`)
3. **Cancelación** de tarea programada
4. **Cambio de estado** a `"cancelado"`
5. **Notificación** al cliente

## Validaciones y Reglas de Negocio

### 1. Límites de Tiempo

- **Mínimo**: 30 minutos de anticipación
- **Máximo**: 7 días de anticipación
- **Validación**: Al crear y modificar pedidos

### 2. Horarios de Restaurante

- **Verificación**: Restaurante debe estar abierto en horario programado
- **Mensaje de Error**: Información específica sobre horarios disponibles
- **Flexibilidad**: Diferentes horarios por sucursal

### 3. Estado de Pedido

- **Modificaciones**: Solo en estado `"programado"`
- **Cancelaciones**: Solo en estado `"programado"`
- **Activación**: Automática al llegar la hora programada

## Casos de Uso

### 1. Pedido para Evento

**Escenario**: Cliente programa pedido para fiesta de cumpleaños
1. Cliente especifica fecha y hora del evento
2. Sistema valida disponibilidad del restaurante
3. Pedido se programa para activación automática
4. En el momento programado, pedido entra a cocina

### 2. Pedido Recurrente

**Escenario**: Cliente habitual programa pedido semanal
1. Cliente programa pedido para mismo día cada semana
2. Sistema permite múltiples pedidos programados
3. Cada pedido se activa automáticamente en su horario

### 3. Modificación de Último Momento

**Escenario**: Cliente necesita cambiar horario de pedido programado
1. Cliente solicita cambio de horario
2. Sistema valida nuevo horario
3. Re-programa activación automática
4. Confirma cambio al cliente

## Beneficios Implementados

### 1. Para el Cliente

- **Conveniencia**: Programar pedidos con anticipación
- **Flexibilidad**: Modificar o cancelar antes de activación
- **Confiabilidad**: Activación automática garantizada
- **Transparencia**: Confirmación y seguimiento completo

### 2. Para el Negocio

- **Planificación**: Visibilidad de demanda futura
- **Automatización**: Proceso completamente automatizado
- **Eficiencia**: Reducción de carga operativa manual
- **Satisfacción**: Mejor experiencia del cliente

### 3. Operativos

- **Integración**: Funciona con todos los sistemas existentes
- **Escalabilidad**: Manejo de múltiples pedidos programados
- **Robustez**: Sistema tolerante a fallos
- **Monitoreo**: Tracking completo del proceso

## Métricas y Monitoreo

### 1. Métricas de Uso

- Número de pedidos programados por día/semana
- Tiempo promedio de anticipación
- Tasa de modificaciones vs cancelaciones
- Distribución de horarios más solicitados

### 2. Métricas de Performance

- Precisión de activación automática
- Tiempo de procesamiento de modificaciones
- Tasa de éxito de validaciones de horario
- Disponibilidad del sistema de programación

### 3. Alertas

- Fallos en activación automática
- Pedidos programados sin activar
- Modificaciones frecuentes (posible problema UX)
- Cancelaciones altas (análisis de causas)

## Integración con Otros Sistemas

### 1. Sistema de Ubicaciones

- Validación de horarios por sucursal
- Asignación automática de pedidos
- Verificación de disponibilidad

### 2. Sistema de Áreas de Entrega

- Validación de cobertura para horario programado
- Cálculo de tarifas y tiempos estimados
- Optimización de rutas futuras

### 3. Dashboard de Análisis

- Visualización de pedidos programados
- Métricas de programación vs inmediatos
- Análisis de patrones temporales

## Próximas Mejoras

### 1. Funcionalidades Adicionales

- **Recordatorios**: Notificaciones previas al cliente
- **Pedidos Recurrentes**: Programación automática periódica
- **Optimización de Horarios**: Sugerencias basadas en capacidad
- **Integración con Calendario**: Sincronización con calendarios externos

### 2. Mejoras de UX

- **Interface de Calendario**: Selector visual de fechas
- **Sugerencias Inteligentes**: Horarios óptimos recomendados
- **Confirmaciones Visuales**: Estados claros del pedido programado
- **Notificaciones Push**: Alertas en tiempo real

### 3. Optimizaciones Técnicas

- **Batch Processing**: Activación eficiente de múltiples pedidos
- **Predicción de Demanda**: Análisis de patrones de programación
- **Cache de Validaciones**: Mejora de performance
- **Failover**: Redundancia para activaciones críticas
