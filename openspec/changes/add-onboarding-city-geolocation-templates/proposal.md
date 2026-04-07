# Change: Add Onboarding City Geolocation Templates

## Why
Step 3 onboarding currently supports basic zone selection and creation, but it does not provide a full map-first editing flow with city-based defaults, bulk default application, and staged commit behavior. This increases setup friction for new restaurants.

## What Changes
- Add backend `deliveryAreaTemplates` table for city template zones.
- Add Step 3 onboarding APIs to fetch template zones by city and save staged zones in one commit.
- Redesign onboarding Step 3 UI:
  - City selector limited to Bucaramanga and Bogotá.
  - Default values panel with one-time bulk apply.
  - Interactive map + per-zone editable list.
  - Polygon editing before submit.
- Keep single sucursal per zone and existing onboarding flow progression.

## Impact
- Affected specs: `guided-onboarding`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/private/onboarding.ts`
  - `packages/backend/convex/private/deliveryAreaTemplates.ts`
  - `packages/backend/convex/lib/deliveryAreaTemplates.ts`
  - `apps/web/modules/onboarding/ui/views/steps/delivery-zones-step.tsx`
  - `apps/web/modules/onboarding/ui/components/onboarding-zones-map.tsx`
