## 1. Prompt Architecture Refactor
- [ ] 1.1 Restructure static core sections into identity, capabilities, and constraints.
- [ ] 1.2 Reorder prompt assembly with dynamic protocol after static constraints.
- [ ] 1.3 Preserve core override behavior without schema or signature changes.

## 2. Dynamic Protocol Cleanup
- [ ] 2.1 Keep only config-dependent flow content in conversation protocol builder.
- [ ] 2.2 Remove duplicated non-config rules from the dynamic protocol.

## 3. Tool Description Normalization
- [ ] 3.1 Update tool descriptions to remove orchestration/sequencing instructions.
- [ ] 3.2 Preserve tool handlers and arg schema constraints unchanged.

## 4. Hygiene and Dead Code
- [ ] 4.1 Remove dead prompt-related helper code no longer referenced.
- [ ] 4.2 Remove commented-out imports and stale prompt comments.

## 5. Prompt Preview Parity
- [ ] 5.1 Ensure private prompt preview uses runtime-equivalent prompt assembly.
- [ ] 5.2 Ensure superadmin prompt preview uses runtime-equivalent prompt assembly.

## 6. Verification
- [ ] 6.1 Run backend typecheck and lint successfully.
- [ ] 6.2 Run monorepo build successfully.
- [ ] 6.3 Verify prompt parity by comparing runtime and preview outputs for sample orgs.
