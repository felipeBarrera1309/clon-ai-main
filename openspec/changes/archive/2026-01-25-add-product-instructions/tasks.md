# Tasks: Add Product-Specific Instructions Field

**Linear Issue**: [LIG-89](https://linear.app/lighthouse-projects/issue/LIG-89) (section 1.14)

## 1. Schema Changes

- [ ] 1.1 Add `instructions` text field to menuProducts table
- [ ] 1.2 Run Convex migration

## 2. Backend Implementation

- [ ] 2.1 Update `menuProducts.create` to accept instructions
- [ ] 2.2 Update `menuProducts.update` to handle instructions
- [ ] 2.3 Include instructions in product queries for AI tools

## 3. AI Agent Updates

- [ ] 3.1 Update `searchMenuProductsTool` to return instructions
- [ ] 3.2 Update AI prompt to process product instructions
- [ ] 3.3 Add logic to ask required questions from instructions
- [ ] 3.4 Add logic to validate time-based instructions
- [ ] 3.5 Add instruction-based customization prompts

## 4. Dashboard UI

- [ ] 4.1 Add "Instrucciones del producto" textarea to product form
- [ ] 4.2 Add help text explaining instruction format
- [ ] 4.3 Show instructions preview in product details
- [ ] 4.4 Add character limit indicator

## 5. Testing & Validation

- [ ] 5.1 Test bot asks questions from instructions
- [ ] 5.2 Test time-based instructions are validated
- [ ] 5.3 Test products without instructions work normally
- [ ] 5.4 Verify LSP diagnostics clean
