# Change: Add Contact Export Functionality

**Linear Issue**: [LIG-167](https://linear.app/lighthouse-projects/issue/LIG-167/exportar-contactos-anadir-boton)
**Priority**: HIGH (2)
**Label**: Bug (missing feature)
**Status**: IMPLEMENTED

## Why

The contacts page currently only supports importing contacts but not exporting them. Restaurants need to export their contact lists for backup, external marketing tools, CRM integration, or data migration purposes.

## What Changes

- Add "Exportar" button to contacts page header (next to "Importar")
- Support CSV export format (XLSX deferred to Phase 2)
- Export ALL contacts for organization (not filtered subset)
- Include contact fields: Nombre, Teléfono, Dirección, Estado, Fecha Registro, Última Actividad, Pedidos, Conversaciones
- UTF-8 BOM for Excel compatibility
- Spanish column headers with Colombian date format (DD/MM/YYYY)

## Implementation Summary

### Files Created
- `apps/web/lib/export-contacts.ts` - CSV generation and download utilities

### Files Modified
- `packages/backend/convex/private/contacts.ts` - Added `getAllForExport` query
- `apps/web/modules/dashboard/ui/views/contacts-view.tsx` - Added Export button

## Impact

- Affected specs: `contacts` capability
- Affected code:
  - `apps/web/lib/export-contacts.ts` - New CSV export utility
  - `apps/web/modules/dashboard/ui/views/contacts-view.tsx` - Export button and handler
  - `packages/backend/convex/private/contacts.ts` - `getAllForExport` query

## Phase 2 (Deferred)
- XLSX/Excel format support
- Filter integration (export filtered subset)
- Custom filename input
