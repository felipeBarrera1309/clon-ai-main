## 1. Backend
- [x] 1.1 Add `deliveryAreaTemplates` table and indexes to Convex schema.
- [x] 1.2 Add Bucaramanga/Bogotá template seed definitions and idempotent seeding helper.
- [x] 1.3 Add `private.deliveryAreaTemplates.listByCity` query.
- [x] 1.4 Add `private.onboarding.saveStep3DeliveryZonesFromTemplates` mutation with validation and onboarding progress update.

## 2. Frontend (Onboarding Step 3)
- [x] 2.1 Add Step 3 zone draft types (`CityKey`, `TemplateZoneDraft`).
- [x] 2.2 Replace Step 3 UI with city-based staged geolocation flow.
- [x] 2.3 Add map component with selection/highlighting for staged zones.
- [x] 2.4 Add polygon editing and per-zone overrides prior to commit.
- [x] 2.5 Add one-time bulk default apply behavior.

## 3. Validation
- [x] 3.1 Run Convex codegen.
- [x] 3.2 Run web lint and typecheck.
- [x] 3.3 Validate OpenSpec change with strict mode.
