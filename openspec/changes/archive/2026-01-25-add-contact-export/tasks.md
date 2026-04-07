# Tasks: Add Contact Export Functionality

**Linear Issue**: [LIG-167](https://linear.app/lighthouse-projects/issue/LIG-167/exportar-contactos-anadir-boton)
**Priority**: HIGH
**Status**: COMPLETED

## 1. Backend Query

- [x] 1.1 Create `getAllForExport` query in `packages/backend/convex/private/contacts.ts`
- [x] 1.2 Return all contacts for organization (no pagination)
- [x] 1.3 Include computed fields: orderCount, conversationCount

## 2. CSV Export Utility

- [x] 2.1 Create `apps/web/lib/export-contacts.ts`
- [x] 2.2 Implement `generateContactsCSV` function with Spanish headers
- [x] 2.3 Implement `downloadContactsCSV` function
- [x] 2.4 Add UTF-8 BOM for Excel compatibility
- [x] 2.5 Format dates as DD/MM/YYYY (Colombian format)
- [x] 2.6 Handle special characters (escape commas, quotes, newlines)

## 3. Export Button UI

- [x] 3.1 Add "Exportar" button to contacts page header (next to Importar)
- [x] 3.2 Use DownloadIcon from lucide-react
- [x] 3.3 Add loading state during export
- [x] 3.4 Show success/error/info toasts

## 4. Integration Testing

- [x] 4.1 TypeScript type checking passes
- [x] 4.2 Lint passes on new/modified files
- [x] 4.3 Build succeeds

## 5. Documentation

- [x] 5.1 Update OpenSpec to match implementation
- [x] 5.2 Remove incorrect Email/Notes columns from spec
- [x] 5.3 Document Phase 2 deferrals (XLSX, filters)

## Deferred to Phase 2

- [ ] Excel/XLSX format support
- [ ] Filter integration (export filtered subset)
- [ ] Custom filename input
