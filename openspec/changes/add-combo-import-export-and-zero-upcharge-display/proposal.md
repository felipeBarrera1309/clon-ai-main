# Change: Add combos import/export and hide +$0 in WhatsApp combo messages

## Why
El módulo de combos no tiene import/export equivalente al de menú, lo que dificulta cargas masivas y migraciones. Además, en los mensajes de WhatsApp se muestra `+$0` en opciones sin recargo, generando ruido visual.

## What Changes
- Agregar exportación de combos a XLSX desde dashboard `/combos`.
- Agregar importación de combos desde CSV/XLSX con previsualización y resolución de conflictos (`skip`, `overwrite`, `substitute`).
- Implementar matching híbrido de opciones por `menu_product_id` y fallback por `nombre + categoría + tamaño`.
- Ocultar `+$0` en el texto de combos enviado al cliente por WhatsApp (`searchCombosTool`).

## Impact
- Affected specs: `combo-management`, `ai-tools`
- Affected code:
  - `packages/backend/convex/private/combos.ts`
  - `packages/backend/convex/private/comboImport.ts` (nuevo)
  - `packages/backend/convex/system/ai/tools/searchCombos.ts`
  - `apps/web/modules/dashboard/ui/views/combos-view.tsx`
  - `apps/web/modules/dashboard/ui/components/combo-import-dialog.tsx` (nuevo)
