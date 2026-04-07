# Change: Add combo slot quantity selection

## Why
El flujo actual de combos soporta min/max por slot, pero no modela de forma explícita la repetición de opciones dentro del mismo slot (ej: elegir 3 bebidas y repetir una). Esto genera inconsistencias entre dashboard, validación y flujo conversacional.

## What Changes
- Extender el modelo de selecciones de combo con `slotId` y `quantity` por opción de slot.
- Mantener compatibilidad backward con payload legado (`slotName + menuProductId` sin `quantity`).
- Actualizar validación de combos para usar suma de cantidades por slot (`sum(quantity)`).
- Actualizar cálculo de precios para incluir recargos por cantidad (`upcharge * quantity`).
- Actualizar dashboard (picker de combos) para selección con stepper por opción en slots multiselección.
- Actualizar tools del agente (`comboSlotFillingTool`, `validateComboSelectionsTool`) para soportar repetición y progreso por cantidades.

## Impact
- Affected specs: `ai-tools`, `combo-management` (new)
- Affected code:
  - `packages/backend/convex/model/orders.ts`
  - `packages/backend/convex/model/orderItems.ts`
  - `packages/backend/convex/system/orders.ts`
  - `packages/backend/convex/system/ai/tools/comboSlotFilling.ts`
  - `packages/backend/convex/system/ai/tools/validateComboSelections.ts`
  - `apps/web/modules/dashboard/ui/components/combo-slot-picker.tsx`
  - `apps/web/modules/dashboard/ui/components/create-order-dialog.tsx`
  - `apps/web/modules/dashboard/ui/components/edit-order-dialog.tsx`
