# Change: Add Product-to-Product Combinations

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89/cambio-automatico-del-estado-de-los-pedidos-segun-el-tipo-de-entrega) (section 1.13)
**Priority**: Medium
**Label**: Feature

## Why

Currently, product combinations/suggestions are based on categories (e.g., "combine with drinks"). Restaurants need finer control to define specific product-to-product combinations for upselling and business rules (e.g., "Hamburguesa Especial" specifically pairs with "Papas grandes" and "Gaseosa 400ml").

## What Changes

- Add ability to define specific combinable products per menu item
- Bot suggests specific products when customer orders a combinable item
- Support for required combinations (product X requires product Y)
- Coexists with existing category-based combinations

## Impact

- Affected specs: `menu-products`
- Affected code:
  - `packages/backend/convex/schema.ts` - Add combinableProducts field
  - `packages/backend/convex/ai/tools/` - Update suggestion logic
  - `apps/web/modules/dashboard/menu/` - Product combination selector UI

## Assumptions Made

1. Combinations are one-directional (A suggests B, but B doesn't auto-suggest A)
2. Both optional suggestions and required combinations are supported
3. UI uses multi-select product picker
