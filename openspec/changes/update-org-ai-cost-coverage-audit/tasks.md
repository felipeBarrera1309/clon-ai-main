## 1. Data Model

- [ ] 1.1 Add shared validators/constants for organization AI cost coverage states, job modes, audit phases and reason codes
- [ ] 1.2 Extend `organizationAiThreads` with explicit resolution and sync state
- [ ] 1.3 Add `organizationAiCostCoverage` and `organizationAiCostCalculationEntries`
- [ ] 1.4 Extend `conversationCostBackfillJobs` with mode/phase metadata needed by the new pipeline

## 2. Backend Pipeline

- [ ] 2.1 Add helpers to recompute organization coverage snapshots and append audit entries
- [ ] 2.2 Update live thread registration and thread cost refresh flows to maintain resolution/sync status
- [ ] 2.3 Update conversation refresh flows to mark failed thread syncs on the organization thread inventory
- [ ] 2.4 Redesign historical backfill with `thread_inventory` plus `full` and `failed_only` modes

## 3. Admin APIs

- [ ] 3.1 Add organization coverage status query and audit log listing query
- [ ] 3.2 Add global coverage listing query and expose coverage info in organization reporting responses
- [ ] 3.3 Extend backfill launch action to accept `mode`

## 4. Admin UI

- [ ] 4.1 Add coverage and audit sections to the organization AI cost tab
- [ ] 4.2 Add global organization coverage visibility and retry entry points in `/admin/costs`
- [ ] 4.3 Surface partial vs complete coverage in reporting screens

## 5. Validation

- [ ] 5.1 Add unit tests for coverage status derivation and audit helpers
- [ ] 5.2 Extend existing cost reporting tests for coverage-aware fallback behavior
- [ ] 5.3 Run OpenSpec validation plus backend/web typecheck and targeted tests
