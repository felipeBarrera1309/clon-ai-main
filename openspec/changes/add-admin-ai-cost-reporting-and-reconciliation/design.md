## Context

El sistema actual mantiene `conversations.cost` como cache lifetime de una conversación y un agregado lifetime por organización. Ese modelo es suficiente para ranking histórico, pero no sirve para analytics temporales porque el costo se asigna a la conversación completa y no al momento real en que ocurrió cada evento de consumo.

Además, negocio necesita revisar el consumo global de todas las organizaciones y contrastarlo contra el cargo real del proveedor. Esa conciliación no existe hoy.

## Goals

- Permitir reporting temporal por rango de fechas usando timestamps reales de eventos de costo
- Exponer un consolidado global cross-org para platform admins
- Permitir conciliación mensual entre costo modelado y costo facturado
- Mantener compatibilidad con la vista actual de detalle por conversación

## Non-Goals

- Ingestión automática de extractos bancarios o facturas del proveedor
- Reconstrucción perfecta de costos históricos de threads auxiliares no persistidos
- Exponer costos AI a usuarios de organización

## Decisions

### 1. Ledger de eventos como base temporal

Se agregará una tabla `aiCostEvents` que registra eventos idempotentes por `messageId` para los mensajes AI con costo. Este ledger será la fuente para reporting temporal y conciliación.

### 2. Resumen mensual materializado

Se agregará una tabla `organizationAiCostMonthly` para evitar recalcular series mensuales completas en cada query admin. El resumen se reconstruirá por `(organizationId, periodMonth)` cuando cambien los eventos de ese mes.

### 3. Reconciliación separada del costo modelado

La facturación real se registrará en `aiBillingStatements` y no mezclará el monto facturado con el ledger de consumo. La conciliación será una vista comparativa `modelado vs facturado vs delta`.

### 4. Persistencia del ledger en flujos existentes

Los flujos existentes de `refreshConversationCost` y `backfillHistoricalConversationCost` poblarán el ledger usando el breakdown normalizado ya calculado para la conversación. Esto evita duplicar lógica de lectura de mensajes.

### 5. Datos temporales basados en `eventAt`

Las métricas por rango y las series mensuales se calcularán con `eventAt` del evento de costo, no con `_creationTime` de la conversación.

## Data Flow

1. Un refresh de costo obtiene el breakdown de mensajes con costo de una conversación.
2. El sistema upsertea los `aiCostEvents` por `messageId`.
3. El sistema elimina eventos stale de esa conversación que ya no aparezcan en el snapshot actual.
4. El sistema reconstruye los meses afectados en `organizationAiCostMonthly`.
5. Las queries admin temporales leen el ledger o el resumen mensual según corresponda.
6. La conciliación mensual cruza `organizationAiCostMonthly` agregado globalmente con `aiBillingStatements`.

## Migration Notes

- El backfill histórico actual se extenderá para poblar ledger y resúmenes mensuales.
- Los eventos históricos con cobertura parcial se marcarán como `estimated`.
- Si una conversación no tiene mensajes con costo, no generará eventos ni resumen mensual.
