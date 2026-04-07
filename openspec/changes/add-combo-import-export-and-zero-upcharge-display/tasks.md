## 1. OpenSpec
- [x] 1.1 Crear deltas en `combo-management` y `ai-tools`
- [x] 1.2 Validar cambio con `openspec validate ... --strict`

## 2. AI WhatsApp formatting
- [x] 2.1 Actualizar `searchCombosTool` para no mostrar `+$0`

## 3. Backend combos export/import
- [x] 3.1 Implementar `private.combos.exportCombosToXlsx`
- [x] 3.2 Implementar `private.comboImport.previewComboImport`
- [x] 3.3 Implementar `private.comboImport.importComboData`
- [x] 3.4 Soportar conflictos `skip|overwrite|substitute` con soft-delete

## 4. Frontend dashboard combos
- [x] 4.1 Agregar botones Importar/Exportar en `/combos`
- [x] 4.2 Integrar query de export y descarga de archivo
- [x] 4.3 Crear `ComboImportDialog` con flujo upload/preview/import

## 5. Verification
- [x] 5.1 Ejecutar validación de OpenSpec
- [x] 5.2 Ejecutar lint/typecheck sobre backend y web
