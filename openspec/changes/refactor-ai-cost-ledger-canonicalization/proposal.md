# Change: Canonicalize AI cost around immutable ledger events

## Why

El sistema ya tiene un ledger temporal (`aiCostEvents`), un snapshot por conversación (`conversations.cost`) y resúmenes mensuales por organización. Sin embargo, todavía existen lecturas y fallbacks que mezclan esas capas y reintroducen `conversations.cost` como fuente analítica, además de persistir texto libre de debug en filas del ledger.

Eso complica la integridad del dato, vuelve frágil la sincronización y deja el path de serving demasiado acoplado al recálculo de costos.

## What Changes

- declarar `aiCostEvents` como fuente canónica persistida del costo AI a nivel aplicación
- proyectar `conversations.cost` exclusivamente desde filas del ledger después de cada sync o backfill
- eliminar `metadata.textPreview` del ledger y mantener solo campos escalares y estables
- estandarizar queries internas para snapshot conversacional y lectura de eventos de ledger
- agregar un entrypoint explícito de reconciliación y reparación de ledger por conversación
- eliminar fallbacks analíticos que agregan costo desde `conversations.cost`
- mantener la lectura de previews/debug separada del ledger, resolviéndola por `messageId` desde threads cuando haga falta

## Impact

- Affected specs:
  - `ai-cost-ledger`
- Related existing changes:
  - `add-conversation-cost-tracking`
  - `add-admin-ai-cost-reporting-and-reconciliation`
  - `update-org-ai-cost-coverage-audit`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/lib/aiCostLedger.ts`
  - `packages/backend/convex/lib/conversationCost.ts`
  - `packages/backend/convex/system/conversations.ts`
  - `packages/backend/convex/system/migrations/removeAiCostEventTextPreview.ts`
  - `packages/backend/convex/superAdmin/conversationCosts.ts`
  - `apps/web/modules/admin/ui/views/admin-conversation-cost-detail-view.tsx`

## Assumptions

- `providerMetadata.gateway.cost` sigue siendo la captura upstream del costo por mensaje
- `conversations.cost` se mantiene como snapshot de UI y conveniencia, no como fuente para analytics
- los previews de texto pueden faltar en la vista admin si no es posible releer el thread; eso no invalida el ledger
