# Spec: Multi-Sector Expansion

## Overview
Adapt the platform to support business types beyond restaurants, including retail stores, services, and general commerce with national shipping capabilities.

## Business Types

### Restaurant (Current)
- Local delivery with polygon-based zones
- Real-time order preparation
- No inventory tracking (assumed always available)
- Payment on delivery common

### Retail Store (New)
- National shipping via courier services
- Inventory tracking required
- Prepayment before shipping
- Longer fulfillment times

### Service Business (Future)
- Appointment scheduling instead of orders
- No physical delivery
- Service-specific flows

## Data Model Changes

### organizations table (additions)
```typescript
businessType: v.union(
  v.literal("restaurant"),
  v.literal("retail"),
  v.literal("service")
),
requiresPrepayment: v.boolean(),
hasInventory: v.boolean(),
```

### inventory table (new, optional)
```typescript
inventory: defineTable({
  organizationId: v.string(),
  productId: v.id("menuProducts"),
  quantity: v.number(),
  lowStockThreshold: v.optional(v.number()),
})
```

### shipments table (new)
```typescript
shipments: defineTable({
  organizationId: v.string(),
  orderId: v.id("orders"),
  carrier: v.string(), // "servientrega", "coordinadora", etc.
  trackingNumber: v.optional(v.string()),
  status: v.string(),
  estimatedDelivery: v.optional(v.number()),
})
```

## Flow Differences

| Aspect | Restaurant | Retail |
|--------|------------|--------|
| Delivery | Local zones | National shipping |
| Payment | On delivery | Prepayment required |
| Inventory | Not tracked | Tracked |
| Fulfillment | Minutes | Days |
| Address validation | Zone-based | City/department |

## AI Agent Adaptations
- Check inventory before confirming orders
- Require payment confirmation before processing
- Provide shipping estimates instead of delivery times
- Handle out-of-stock scenarios gracefully
