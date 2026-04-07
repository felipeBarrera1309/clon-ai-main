## Context

El backend ya tiene una noción parcial de costo:

- `conversations.cost` existe en schema
- `system/conversations.ts` recalcula el total leyendo `providerMetadata.gateway.cost` desde el thread de `@convex-dev/agent`
- ese cálculo está duplicado y ocurre principalmente al resolver la conversación
- el dashboard no expone ni el total ni un desglose por mensaje

Además, algunos tools crean threads auxiliares para subtareas como enriquecimiento y validación. Esos threads no están vinculados hoy a la conversación principal, por lo que su costo no puede agregarse al total conversacional.

## Goals

- Tener un total de costo AI por conversación actualizado durante la ejecución
- Incluir el gasto del thread principal y de threads auxiliares ligados a la conversación
- Permitir que platform admins vean agregado por organización, total por conversación y desglose por mensaje
- Mantener el dashboard operativo libre de datos de costo y limitar esa superficie al admin de plataforma

## Non-Goals

- Reconstituir con precisión absoluta threads auxiliares históricos ya creados sin vínculo persistido
- Exponer en el dashboard operativo el transcript técnico completo de debug o datos de costo
- Cambiar la lógica de pricing del proveedor AI
- Reconstruir con precisión forense subthreads históricos no registrados antes del deploy

## Decisions

### 1. Registrar threads AI por conversación

Se agregará una tabla dedicada, por ejemplo `conversationAiThreads`, con:

- `conversationId`
- `organizationId`
- `threadId`
- `kind` (`primary` o `auxiliary`)
- `purpose` (ej. `support-agent`, `menu-context`, `combination-enrichment`, `combination-validation`)

Esto permite agregar costos incluso cuando un tool crea threads adicionales.

### 2. Mantener `conversations.cost` como cache del total

`conversations.cost` seguirá siendo el valor agregado usado por listados y analytics, pero se actualizará más temprano mediante un refresco explícito después de ejecuciones AI relevantes, no solo al resolver.

Opcionalmente se añadirá `costUpdatedAt` para saber si el valor está fresco y poder depurar sincronización.

### 3. Unificar el cálculo de costo

Se extraerá una rutina reutilizable para:

- listar mensajes de todos los threads registrados de una conversación
- leer `providerMetadata.gateway.cost`
- ignorar mensajes sin costo válido
- sumar el total y devolver también un desglose normalizado por mensaje

Los flujos de resolución dejarán de duplicar esa lógica y reutilizarán el mismo camino.

### 4. Refrescar costo al finalizar corridas AI

El refresco de costo se invocará al terminar una ejecución del agente de soporte, incluso si el resultado final visible para el usuario es vacío y solo hubo tool calls.

También se registrarán y vincularán threads auxiliares al momento de crearlos en tools que disparan subagentes.

### 5. Exponer un desglose seguro solo para admin

La query privada de desglose devolverá entradas normalizadas por mensaje con:

- timestamp
- threadId
- purpose del thread
- role
- modelo/proveedor
- tokens
- costo
- indicador de si el mensaje es visible para el cliente
- preview opcional solo para texto visible

No devolverá prompts internos completos ni payloads sensibles de tools en la vista admin.

### 6. Backfill histórico por organización y por batches

El histórico no se recalculará on the fly. Se añadirá un job por organización que:

- se lanza manualmente por CLI
- congela un `cutoffTimestamp`
- procesa conversaciones históricas por batches pequeños
- se auto-encadena con `scheduler.runAfter(0, ...)`
- persiste progreso y errores en una tabla de jobs

El job reutiliza el mismo flujo de refresh de costo y marca `costCoverage`:

- `complete` cuando existen threads auxiliares persistidos o tracking live
- `estimated` cuando solo se puede garantizar el thread principal histórico

## Data Flow

1. Se crea o reutiliza una conversación con thread principal.
2. El thread principal se registra como `primary`.
3. Si un tool crea un thread auxiliar, lo registra contra la conversación.
4. Cuando termina una corrida AI, el backend relee los mensajes de todos los threads registrados.
5. El sistema recalcula y persiste `conversations.cost`.
6. Los agregados admin por organización leen `conversations.cost`, no mensajes.
7. El detalle admin por conversación calcula el desglose por mensaje bajo demanda.
8. El histórico se completa con un backfill por organización y batches.

## Migration Notes

- Se debe backfillear el vínculo del thread principal para conversaciones existentes.
- Los threads auxiliares históricos que nunca fueron persistidos no podrán asociarse retroactivamente de forma confiable.
- Para conversaciones antiguas, el total inicial puede reflejar solo el thread principal y quedar marcado como `estimated`.
- El backfill histórico debe poder lanzarse por organización para evitar lecturas o mutaciones masivas en Convex.
