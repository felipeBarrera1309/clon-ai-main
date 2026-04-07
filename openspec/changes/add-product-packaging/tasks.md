# Tasks: Add Product Packaging Cost

**Linear Issue**: [LIG-87](https://linear.app/lighthouse-projects/issue/LIG-87/nueva-propiedad-de-producto-empaque)

## 1. Schema Changes

- [ ] 1.1 Add `packagingCost` optional field to `menuProducts` table in schema.ts
- [ ] 1.2 Run Convex migration to apply schema changes

## 2. Backend Implementation

- [ ] 2.1 Update `menuProducts.create` mutation to accept packagingCost
- [ ] 2.2 Update `menuProducts.update` mutation to handle packagingCost
- [ ] 2.3 Update `menuProducts.list` query to include packagingCost
- [ ] 2.4 Update order price calculation to include packaging costs
- [ ] 2.5 Update `confirmOrderTool` to show packaging in summary
- [ ] 2.6 Update `makeOrderTool` to store packaging costs in order items

## 3. Dashboard UI

- [ ] 3.1 Add "Empaque" column to menu products table
- [ ] 3.2 Add packaging cost input to product create form
- [ ] 3.3 Add packaging cost input to product edit form
- [ ] 3.4 Format packaging cost as Colombian peso currency
- [ ] 3.5 Show packaging cost in order details view

## 4. AI Agent Updates

- [ ] 4.1 Update `searchMenuProductsTool` to include packaging info
- [ ] 4.2 Update price display logic in bot responses
- [ ] 4.3 Add packaging breakdown in order confirmation message

## 5. Testing & Validation

- [ ] 5.1 Test product with packaging cost creates correctly
- [ ] 5.2 Test product without packaging cost works unchanged
- [ ] 5.3 Test order total calculation includes packaging
- [ ] 5.4 Test bot displays correct totals to customer
- [ ] 5.5 Verify LSP diagnostics clean on all changed files
