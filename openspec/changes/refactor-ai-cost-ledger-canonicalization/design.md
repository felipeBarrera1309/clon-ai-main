## Context

El dominio de costo AI ya tiene cuatro capas implícitas:

1. captura upstream en mensajes de threads del agente
2. ledger persistido de eventos (`aiCostEvents`)
3. snapshot rápido por conversación (`conversations.cost`)
4. resumen mensual derivado (`organizationAiCostMonthly`)

El problema es que algunas lecturas todavía saltan entre capas según cobertura o conveniencia. Eso rompe el contrato de autoridad y hace más difícil reparar o auditar divergencias.

## Goals

- usar un único store analítico canónico para costo AI: `aiCostEvents`
- tratar snapshots y resúmenes como proyecciones descartables y reconstruibles
- impedir que un fallo de proyección rompa la entrega de respuestas
- quitar texto libre de filas del ledger para reducir superficie de corrupción
- ofrecer una reconciliación explícita entre source scan, ledger y snapshot

## Non-Goals

- rediseñar la captura upstream fuera de `providerMetadata.gateway.cost`
- exponer transcript técnico completo en el ledger
- reemplazar la UI de detalle por una interfaz puramente thread-based

## Decisions

### 1. Ledger canónico, snapshot derivado

`aiCostEvents` pasa a ser la única fuente persistida para analytics y auditoría. `conversations.cost` y `organizationAiCostMonthly` se recalculan desde ese ledger.

### 2. Proyección en dos fases

`refreshConversationCost` y el backfill histórico harán:

1. scan de threads y sync/repair del ledger
2. rebuild del snapshot conversacional desde eventos persistidos del ledger

Si el sync falla de forma inesperada, se preserva el último snapshot válido y solo se actualizan campos de error.

### 3. Ledger sin texto libre

`aiCostEvents.metadata` conserva solo campos escalares (`role`, `threadPurpose`, `isCustomerVisible`). El preview de texto se obtiene on-demand desde threads usando `messageId`.

### 4. Contrato de lectura por capa

- UI de conversación: snapshot de `conversations`
- drilldown/admin detail: `aiCostEvents` + preview best-effort fuera del ledger
- reporting por rango: `organizationAiCostMonthly` para meses completos y `aiCostEvents` para bordes o ventanas parciales

### 5. Reconciliación explícita

Se agrega un entrypoint que compara:

- sumatoria source-of-truth desde mensajes/thread scan
- sumatoria del ledger
- snapshot actual de la conversación

La reparación ocurre solo cuando se solicita explícitamente.

## Risks / Trade-offs

- releer threads para hidratar previews sigue siendo caro, pero queda confinado a vistas de detalle y fuera del ledger
- remover fallback desde `conversations.cost` puede mostrar ceros en organizaciones aún incompletas, pero mantiene la integridad del contrato
- mantener snapshot y ledger en paralelo exige disciplina, pero ambos quedan claramente separados por responsabilidad

## Migration Plan

1. desplegar schema/helper sin `textPreview`
2. cambiar refresh/backfill para proyectar snapshot desde ledger
3. mover lecturas admin/reporting a ledger-first
4. correr migración para limpiar `metadata.textPreview` en eventos viejos
5. usar reconciliación explícita para reparar divergencias detectadas
