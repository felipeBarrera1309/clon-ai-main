# Change: Add Product Packaging Cost Property

**Linear Issue**: [LIG-87](https://linear.app/lighthouse-projects/issue/LIG-87/nueva-propiedad-de-producto-empaque)
**Priority**: High
**Label**: Feature

## Why

Some products have additional packaging costs (e.g., special containers, boxes) that need to be added to the final price. Currently there's no way to configure this per-product, forcing businesses to either absorb the cost or manually adjust prices.

## What Changes

- Add optional `packagingCost` field to menu products schema
- Bot automatically adds packaging cost to product price when calculating totals
- Dashboard displays packaging cost column in menu table (editable like other fields)
- Order summary shows packaging costs breakdown

## Impact

- Affected specs: `menu-products`
- Affected code:
  - `packages/backend/convex/schema.ts` - Add packagingCost field to menuProducts table
  - `packages/backend/convex/private/menuProducts.ts` - Update mutations/queries
  - `apps/web/modules/dashboard/menu/` - Add column to menu table
  - `packages/backend/convex/ai/tools/` - Update price calculation in order tools

## Open Questions (for user to confirm)

1. Should packaging cost be shown as separate line item in order summary, or just added silently to product price?
2. Should there be a global "apply packaging to all products" option?
