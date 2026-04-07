# Change: Add Product-Specific Instructions Field

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89/cambio-automatico-del-estado-de-los-pedidos-segun-el-tipo-de-entrega) (section 1.14)
**Priority**: Medium
**Label**: Feature

## Why

Each product may have specific ordering rules, preparation notes, or required questions that the bot should ask. Currently there's no way to define per-product instructions, forcing generic bot behavior for all products.

## What Changes

- Add `instructions` text field to menu products
- Bot reads and follows product-specific instructions when customer orders
- Support for:
  - Required questions ("Pregunta el sabor antes de agregar")
  - Warnings ("Disponible solo de 12:00 p.m. a 3:00 p.m.")
  - Preparation notes ("Pregunta si lo quiere con borde relleno")

## Impact

- Affected specs: `menu-products`
- Affected code:
  - `packages/backend/convex/schema.ts` - Add instructions field
  - `packages/backend/convex/ai/tools/` - Process instructions
  - `apps/web/modules/dashboard/menu/` - Instructions editor

## Assumptions Made

1. Instructions are free-form text interpreted by the AI
2. Bot uses instructions contextually when product is mentioned/selected
3. Instructions are optional per product
