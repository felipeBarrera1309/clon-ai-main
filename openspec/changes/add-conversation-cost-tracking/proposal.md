# Change: Add Conversation Cost Tracking

## Why

Hoy el sistema ya guarda un `cost` agregado en `conversations`, pero ese valor se calcula tarde y de forma incompleta para la necesidad actual:

- solo se recalcula al resolver la conversación
- se obtiene desde mensajes del thread principal
- no existe visibilidad admin del costo por mensaje ni del agregado por organización
- algunos tools crean threads auxiliares, por lo que el gasto real por conversación puede quedar subestimado

El equipo necesita que platform admins puedan ver cuánto dinero está consumiendo cada conversación y cada organización, incluyendo histórico backfilleado por batches, usando la metadata de costo ya disponible en los threads de `@convex-dev/agent`.

## What Changes

- Registrar todos los threads de AI asociados a una conversación, incluyendo el thread principal y los threads auxiliares creados por tools
- Mantener `conversations.cost` actualizado durante la vida de la conversación, no solo al resolverla
- Exponer queries solo para platform admins con:
  - agregado de costo por organización
  - ranking de conversaciones por costo
  - desglose por mensaje por conversación
- Añadir un backfill histórico por organización, lanzable por CLI y procesado por batches encadenados con scheduler
- Marcar histórico potencialmente incompleto con `costCoverage = "estimated"`
- Evitar exponer prompts internos completos en la vista admin

## Impact

- Affected specs: `conversation-costs`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/model/conversations.ts`
  - `packages/backend/convex/system/conversations.ts`
  - `packages/backend/convex/system/messages.ts`
  - `packages/backend/convex/system/responseDebounceScheduler.ts`
  - `packages/backend/convex/system/ai/tools/askAboutMenuWithContext.ts`
  - `packages/backend/convex/system/ai/tools/askCombinationValidation.ts`
  - `packages/backend/convex/private/conversations.ts`
  - `packages/backend/convex/superAdmin/conversationCosts.ts`
  - `packages/backend/convex/system/migrations/backfillConversationCosts.ts`
  - `packages/backend/convex/migrations/backfillConversationCosts.ts`
  - `apps/web/modules/admin/ui/components/organization-ai-costs-tab.tsx`
  - `apps/web/modules/admin/ui/views/admin-conversation-cost-detail-view.tsx`

## Assumptions

- El valor `providerMetadata.gateway.cost` es la fuente de verdad del costo por mensaje
- El costo debe mostrarse en la moneda/unidad entregada actualmente por el gateway, que hoy se interpreta como USD decimal
- Los costos solo deben ser visibles para platform admins, no para usuarios de organización
- El backfill histórico solo puede garantizar el thread principal cuando los subthreads antiguos no quedaron persistidos
