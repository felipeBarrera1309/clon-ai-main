## 1. Print Layout & Styling
- [ ] 1.1 Create `OrderTicket` print-optimized component
- [ ] 1.2 Design thermal printer-friendly layout (80mm width)
- [ ] 1.3 Include: order number, items, quantities, notes, customer info, delivery address
- [ ] 1.4 Add print-specific CSS with `@media print`
- [ ] 1.5 Support multiple ticket sizes (80mm, A4)

## 2. Manual Print Flow
- [ ] 2.1 Add "Imprimir" button to order detail view
- [ ] 2.2 Create print preview modal
- [ ] 2.3 Implement `window.print()` trigger with proper styling

## 3. New Order Notifications
- [ ] 3.1 Create `NewOrderNotification` pop-up component
- [ ] 3.2 Implement browser notification API for background alerts
- [ ] 3.3 Add audio notification for new orders (configurable)
- [ ] 3.4 Show notification regardless of current dashboard page
- [ ] 3.5 Add "Imprimir comanda" button in notification

## 4. Batch Printing
- [ ] 4.1 Create batch print view in orders module
- [ ] 4.2 Add checkbox selection for multiple orders
- [ ] 4.3 Create "Imprimir seleccionados" action
- [ ] 4.4 Create "Imprimir todos pendientes" action
- [ ] 4.5 Generate combined print document for batch

## 5. Auto-Print System (Option 1 - Primary)
- [ ] 5.1 Research browser extension approach for auto-print
- [ ] 5.2 Create extension that monitors for new orders
- [ ] 5.3 Implement auto-trigger of print dialog
- [ ] 5.4 Add location filter for multi-location restaurants
- [ ] 5.5 Add enable/disable toggle in settings

## 6. Settings & Configuration
- [ ] 6.1 Add print settings section in dashboard settings
- [ ] 6.2 Configure default ticket size
- [ ] 6.3 Configure auto-print on/off
- [ ] 6.4 Configure notification sound on/off
- [ ] 6.5 Configure location filter for printing

## 7. Testing & Validation
- [ ] 7.1 Test print layout on thermal printers
- [ ] 7.2 Test notifications work in background
- [ ] 7.3 Test batch printing with multiple orders
- [ ] 7.4 Verify linting passes on all modified files
