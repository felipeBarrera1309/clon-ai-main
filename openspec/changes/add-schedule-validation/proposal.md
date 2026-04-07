# Change: Add Schedule Validation by Location and Delivery Type

**Linear Issue**: [LIG-88](https://linear.app/lighthouse-projects/issue/LIG-88/validacion-de-horarios-por-sucursal-y-por-tipo-de-entrega-al-confirmar)
**Priority**: High
**Label**: Feature

## Why

Currently, the bot doesn't validate if a location can fulfill a specific delivery type at the current time. This leads to orders being placed when delivery service is closed but pickup is still available (or vice versa), causing operational issues and customer frustration.

## What Changes

- Add three independent schedule configurations per location:
  1. **General hours** - When the physical location is open
  2. **Delivery hours** - When delivery service is available
  3. **Pickup hours** - When pickup service is available
- Bot validates schedules after address confirmation
- Bot offers alternatives when requested service is unavailable:
  - Switch to other delivery type if available
  - Schedule order for later

## Impact

- Affected specs: `restaurant-locations` (new), `ai-tools`
- Affected code:
  - `packages/backend/convex/schema.ts` - Add schedule fields to restaurantLocations
  - `packages/backend/convex/ai/tools/validateAddressTool.ts` - Add schedule validation
  - `apps/web/modules/dashboard/restaurant-locations/` - Schedule configuration UI

## Assumptions Made

1. Schedule fields are **optional** - if not configured, service is assumed available during general hours
2. Each schedule type has independent day/time ranges
3. Validation happens AFTER address confirmation, when location is assigned

## Open Questions

1. Should closed services show estimated wait time until opening?
2. Integration with scheduled orders - auto-select next available slot?
