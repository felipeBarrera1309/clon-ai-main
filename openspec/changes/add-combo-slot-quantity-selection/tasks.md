## 1. Implementation
- [x] 1.1 Extender contratos de selección de combo para soportar `slotId` y `quantity`.
- [x] 1.2 Ajustar validación de slots a `sum(quantity)` con límites `minSelections/maxSelections`.
- [x] 1.3 Ajustar pricing de combos a `basePrice + Σ(upcharge * quantity)`.
- [x] 1.4 Actualizar persistencia de snapshots de combo (`menuProductOrderItems`) usando cantidad por selección.
- [x] 1.5 Implementar compatibilidad backward para payload legado sin `quantity`.
- [x] 1.6 Actualizar `comboSlotFillingTool` para selección múltiple y repetición por opción.
- [x] 1.7 Actualizar `validateComboSelectionsTool` para validación por `slotId` (fallback por `slotName`).
- [x] 1.8 Actualizar `ComboSlotPicker` con stepper (`- / +`) en slots multiselección.
- [x] 1.9 Actualizar formularios de crear/editar pedido para transportar `slotId` y `quantity`.

## 2. Validation
- [x] 2.1 Verificar caso "elige 3 de 5" sin repetición.
- [x] 2.2 Verificar caso "elige 3 de 5" con repetición (ej: 2+1).
- [x] 2.3 Verificar rechazo cuando `sum(quantity) < minSelections`.
- [x] 2.4 Verificar rechazo cuando `sum(quantity) > maxSelections`.
- [x] 2.5 Verificar compatibilidad con payload legado en tools y creación de orden.
