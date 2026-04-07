# Change: Add auditable organization AI cost coverage

## Why

El sistema actual ya separa parte del costo entre conversaciones y threads no asignados, pero no permite afirmar de forma operativa cuándo una organización quedó completamente cubierta ni explicar qué pasó con cada thread o conversación durante el cálculo histórico.

Negocio necesita una capa auditable y operable que preserve el costo por conversación como vista principal, sin perder el costo histórico de threads no mapeados a conversación.

## What Changes

- extender el inventario `organizationAiThreads` con estados explícitos de resolución y sync
- agregar una tabla de cobertura por organización para saber si el histórico está `not_started`, `running`, `partial` o `complete`
- agregar una tabla append-only de auditoría por entidad y por job
- extender el backfill histórico para inventariar threads del org antes de sincronizar costos
- agregar queries/admin UI para revisar cobertura, auditoría y reintentos `failed_only`
- mantener `conversations.cost` como cache derivada del costo asignado a conversación

## Impact

- Affected specs:
  - `admin-ai-cost-reporting`
  - `organization-ai-cost-coverage`
- Related existing changes:
  - `add-conversation-cost-tracking`
  - `add-admin-ai-cost-reporting-and-reconciliation`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/model/organizationAiThreads.ts`
  - `packages/backend/convex/system/migrations/backfillConversationCosts.ts`
  - `packages/backend/convex/system/organizationAiThreads.ts`
  - `packages/backend/convex/system/conversations.ts`
  - `packages/backend/convex/superAdmin/conversationCosts.ts`
  - `apps/web/modules/admin/ui/components/organization-ai-costs-tab.tsx`
  - `apps/web/app/(dashboard)/admin/costs/page.tsx`
