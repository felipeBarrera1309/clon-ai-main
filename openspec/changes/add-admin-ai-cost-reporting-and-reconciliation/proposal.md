# Change: Add admin AI cost reporting and reconciliation

## Why

El tracking actual de costo AI cubre el total por conversación y el agregado lifetime por organización, pero no resuelve la necesidad operativa actual:

- falta análisis por rango de fechas con consolidado mensual
- falta una vista global cross-organization para platform admins
- falta una capa de conciliación que explique la diferencia entre costo modelado y costo realmente facturado

## What Changes

- agregar un ledger idempotente de eventos de costo AI por mensaje/fuente
- agregar un resumen mensual materializado por organización
- extender el backfill histórico para poblar ledger y resúmenes mensuales
- exponer queries admin para:
  - overview por organización en rango
  - serie mensual por organización
  - ranking de conversaciones por costo en rango
  - overview global cross-org
  - ranking de organizaciones por costo en rango
  - conciliación mensual modelado vs facturado
- agregar carga manual de estados de facturación mensual
- extender la UI admin con filtros por rango y una nueva vista `/admin/costs`

## Impact

- Affected specs:
  - `admin-ai-cost-reporting`
  - `ai-billing-reconciliation`
- Related existing change:
  - `add-conversation-cost-tracking`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/lib/conversationCost.ts`
  - `packages/backend/convex/lib/aiCostLedger.ts`
  - `packages/backend/convex/system/conversations.ts`
  - `packages/backend/convex/system/migrations/backfillConversationCosts.ts`
  - `packages/backend/convex/superAdmin/conversationCosts.ts`
  - `apps/web/modules/admin/ui/components/organization-ai-costs-tab.tsx`
  - `apps/web/app/(dashboard)/admin/costs/page.tsx`
  - `apps/web/modules/admin/constants.ts`

## Assumptions

- la moneda visible seguirá siendo USD decimal
- la zona horaria de negocio para cortes será `America/Bogota`
- la fuente preferida de costo exacto seguirá siendo `providerMetadata.gateway.cost`
- la conciliación inicial será manual por mes y proveedor, sin ingestión automática de facturas
