# Tasks: Add Product-to-Product Combinations

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89) (section 1.13)

## 1. Schema Changes

- [ ] 1.1 Add `combinableProducts` field to menuProducts table (array of product IDs)
- [ ] 1.2 Add `requiredProducts` field for mandatory combinations (array of product IDs)
- [ ] 1.3 Run Convex migration

## 2. Backend Implementation

- [ ] 2.1 Update `menuProducts.create` to accept combinable/required products
- [ ] 2.2 Update `menuProducts.update` to handle combination changes
- [ ] 2.3 Create `getProductCombinations(productId)` query
- [ ] 2.4 Create `validateRequiredProducts(orderItems)` function

## 3. AI Agent Updates

- [ ] 3.1 Update product suggestion logic to include specific combinations
- [ ] 3.2 Add upsell prompt when combinable products exist
- [ ] 3.3 Add validation for required product combinations
- [ ] 3.4 Generate appropriate bot response for missing required products

## 4. Dashboard UI

- [ ] 4.1 Add "Productos combinables" section to product form
- [ ] 4.2 Create multi-select product picker component
- [ ] 4.3 Add "Productos requeridos" section (optional)
- [ ] 4.4 Show combination preview in product list
- [ ] 4.5 Add search/filter in product picker

## 5. Testing & Validation

- [ ] 5.1 Test bot suggests specific products when ordering
- [ ] 5.2 Test required products validation
- [ ] 5.3 Test category and product combinations coexist
- [ ] 5.4 Verify LSP diagnostics clean
