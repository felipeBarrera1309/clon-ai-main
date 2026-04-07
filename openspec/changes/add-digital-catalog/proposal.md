# Change: Add Digital Catalog and Marketplace

## Why
Restaurants currently send customers to third-party menu links, causing order drop-off when customers complete orders there instead of returning to WhatsApp. A native digital catalog generated from existing product data keeps customers in the ecosystem. Future expansion to a marketplace of restaurants creates a discovery platform.

## What Changes
- Auto-generate digital catalog/mini-website from menu products
- Create public catalog URL per restaurant
- Add product images display in catalog
- Enable "Order via WhatsApp" button that opens WhatsApp with pre-filled message
- Future: Marketplace directory of multiple restaurant catalogs

## Impact
- Affected specs: New `digital-catalog` capability
- Affected code:
  - `apps/web/app/(public)/` - Public catalog routes
  - `apps/web/modules/catalog/` - Catalog generation and display
  - `packages/backend/convex/` - Public queries for catalog data
