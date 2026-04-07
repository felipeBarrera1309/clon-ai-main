# Tasks: Add Automatic Order Status Updates

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89/cambio-automatico-del-estado-de-los-pedidos-segun-el-tipo-de-entrega)

## 1. Schema Changes

- [ ] 1.1 Add `deliveryType` field to orders table (enum: 'delivery' | 'pickup')
- [ ] 1.2 Add `estimatedCompletionTime` field to orders table
- [ ] 1.3 Add `autoStatusBuffer` field to organization config (minutes)
- [ ] 1.4 Run Convex migration

## 2. Backend - Auto Status Logic

- [ ] 2.1 Create `shouldAutoComplete(order)` utility function
- [ ] 2.2 Implement delivery order completion logic (estimated time + buffer)
- [ ] 2.3 Implement pickup order completion logic (pickup window + buffer)
- [ ] 2.4 Create cron job to check and update stale orders
- [ ] 2.5 Add status transition validation (prevent invalid transitions)

## 3. Backend - Order Creation Updates

- [ ] 3.1 Update `makeOrderTool` to set deliveryType
- [ ] 3.2 Calculate and set estimatedCompletionTime on order creation
- [ ] 3.3 Update `scheduleOrderTool` to handle delivery type

## 4. AI Agent Updates

- [ ] 4.1 Update active order detection to exclude auto-completed orders
- [ ] 4.2 Update `getContactInfoTool` to return only truly active orders
- [ ] 4.3 Ensure new order flow starts fresh after previous order auto-completes

## 5. Dashboard Updates

- [ ] 5.1 Add auto-status buffer configuration to settings
- [ ] 5.2 Show estimated completion time in order details
- [ ] 5.3 Add indicator for auto-completed orders
- [ ] 5.4 Allow manual override of auto-completed status

## 6. Testing & Validation

- [ ] 6.1 Test delivery order auto-completes after estimated time
- [ ] 6.2 Test pickup order auto-completes after pickup window
- [ ] 6.3 Test bot correctly identifies new vs old orders
- [ ] 6.4 Test manual override still works
- [ ] 6.5 Verify cron job runs correctly
- [ ] 6.6 Verify LSP diagnostics clean
