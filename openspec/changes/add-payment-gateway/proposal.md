# Change: Add Payment Gateway Integration

## Why
Restaurants need to collect payments before delivery, especially for larger orders or new customers. Integrating Colombian payment gateways (Wompi, Epayco) enables sending payment links via WhatsApp, automatic payment confirmation, and order status updates. This is essential for expanding to e-commerce/retail where prepayment is standard.

## What Changes
- Integrate Wompi and/or Epayco payment APIs
- Create payment link generation system
- Add AI tool for sending payment links via WhatsApp
- Implement webhook handlers for payment confirmation
- Auto-update order status when payment is confirmed
- Send confirmation message to customer after payment

## Impact
- Affected specs: New `payment-gateway` capability
- Affected code:
  - `packages/backend/convex/` - Payment tables, mutations, webhooks
  - `packages/backend/convex/system/ai/tools/` - Payment link tool
  - `packages/backend/convex/model/` - Payment processing functions
  - `apps/web/modules/dashboard/` - Payment status UI, settings
