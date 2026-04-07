# Change: Add Multi-Sector Expansion Support

## Why
The platform is currently optimized for restaurants with local delivery. Expanding to other business types (retail stores, services, general commerce) opens new market opportunities. These businesses have different needs: national shipping instead of local delivery, inventory management, and prepayment requirements.

## What Changes
- Analyze differences between local delivery (restaurants) and national shipping (retail)
- Adapt order flow for prepayment-before-shipping model
- Add inventory tracking capabilities
- Support different business type configurations
- Modify delivery area logic for national coverage

## Impact
- Affected specs: Multiple existing specs need adaptation
- Affected code:
  - `packages/backend/convex/schema.ts` - Business type field, inventory tables
  - `packages/backend/convex/system/ai/` - Adapted flows per business type
  - `apps/web/modules/dashboard/` - Business type configuration UI

## Priority
**Low** - Planned for Q1 expansion after restaurant product is stable.

## Linear Issues
- LIG-14: Expansión a Otros Sectores (parent)
- LIG-56: Analizar diferencias entre delivery local y envíos nacionales
- LIG-57: Adaptar flujos para comercios generales
