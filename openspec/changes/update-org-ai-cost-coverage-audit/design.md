## Context

El ledger temporal (`aiCostEvents`) ya modela correctamente costo por mensaje/thread y separa costo asignado a conversación frente a costo `organization_unassigned`. Sin embargo:

- `organizationAiThreads` no expresa si un thread quedó resuelto, ignorado, pendiente o fallido
- el backfill histórico solo expone contadores agregados y no deja trazabilidad por entidad
- no existe una noción persistida de cobertura/completitud por organización
- la operación admin no permite responder qué quedó fuera, por qué, ni cómo reintentar solo fallidos

## Goals

- mantener `conversations.cost` como vista principal del costo por conversación
- garantizar que todo thread relevante de una organización termine clasificado como `conversation`, `organization_unassigned` o `ignored`
- persistir auditoría por entidad y por job para explicar omitidas, fallidas y actualizadas
- exponer un estado de cobertura claro por organización
- permitir reintentos focalizados sobre fallidos

## Non-Goals

- sustituir `conversations.cost` por una UI puramente thread-based
- inventar asignaciones heurísticas dudosas a conversación
- cambiar la lógica de pricing del proveedor
- eliminar el fallback legacy para organizaciones todavía no cubiertas

## Decisions

### 1. Fuente de verdad thread-first, vista principal por conversación

La capa económica de verdad seguirá siendo el costo por mensaje/thread en `aiCostEvents`. `conversations.cost` se mantiene como cache derivada de los threads asignados a la conversación.

### 2. Cobertura explícita por organización

Se agregará una tabla `organizationAiCostCoverage` que resume el estado operativo de una organización y se reconstruye a partir del inventario canónico `organizationAiThreads`.

Una organización estará `complete` solo cuando todos los threads relevantes descubiertos estén resueltos y sincronizados, sin fallos pendientes.

### 3. Auditoría append-only por entidad y por job

Se agregará `organizationAiCostCalculationEntries` para registrar cada intento relevante del pipeline con `jobId`, entidad, fase, outcome, reasonCode y mensaje humano.

### 4. Backfill con fase explícita de inventario

El job histórico pasará a incluir una fase inicial `thread_inventory` que descubre todos los threads de la organización usando `userId = organizationId`. Después reutilizará los flujos existentes de refresh conversacional y de threads no asignados para sincronizar el ledger sin romper la lógica actual.

### 5. Reintentos por modo

El lanzamiento del backfill aceptará `mode = full | failed_only`.

- `full` rehace el pipeline completo
- `failed_only` reutiliza el inventario y solo intenta re-sincronizar entidades marcadas como fallidas

## Risks / Trade-offs

- Recalcular cobertura escaneando `organizationAiThreads` añade costo de lectura extra, pero simplifica la consistencia del estado.
- Mantener `conversations.cost` y ledger en paralelo exige cuidar la sincronización, pero preserva la UX y los reportes actuales.
- Introducir auditoría append-only aumenta volumen de datos, pero es la forma más fiable de responder qué pasó por entidad y por job.

## Migration Plan

1. Desplegar schema y helpers nuevos.
2. Hacer que registros live de threads y refreshes actualicen estados de resolución/sync.
3. Migrar el job histórico para inventariar y auditar.
4. Exponer nuevas queries admin y mostrar cobertura/auditoría en UI.
5. Mantener fallback legacy solo para organizaciones `not_started` o `partial`.

## Open Questions

- Ninguna para esta iteración; se implementa con reason codes explícitos y superficies admin global + detalle de organización.
