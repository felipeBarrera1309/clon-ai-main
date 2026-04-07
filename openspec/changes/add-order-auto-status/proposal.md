# Change: Add Automatic Order Status Updates by Delivery Type

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89/cambio-automatico-del-estado-de-los-pedidos-segun-el-tipo-de-entrega) (main feature)
**Priority**: High
**Label**: Improvement

## Why

Orders are not being finalized correctly, causing the bot to reference old "active" orders when customers return to place new orders. This creates confusion and incorrect order handling.

## What Changes

- Implement automatic order status progression based on delivery type
- **Delivery orders**: Auto-complete after estimated delivery time + buffer
- **Pickup orders**: Auto-complete after pickup window expires
- Ensure orders reach terminal state (`entregado` or `cancelado`) automatically
- Bot correctly identifies "active" vs "completed" orders

## Impact

- Affected specs: `orders` (new)
- Affected code:
  - `packages/backend/convex/schema.ts` - Add delivery type tracking
  - `packages/backend/convex/private/orders.ts` - Auto-status logic
  - `packages/backend/convex/crons.ts` - Scheduled job for status updates
  - `packages/backend/convex/ai/tools/` - Update active order detection

## Assumptions Made

1. Status changes are time-based (estimated delivery/pickup time + configurable buffer)
2. Buffer time is configurable per organization (default: 30 minutes after estimated time)
3. Manual override is still possible from dashboard

## Open Questions

1. Should there be notifications to restaurant when auto-completing orders?
2. What's the default buffer time before auto-completion?
