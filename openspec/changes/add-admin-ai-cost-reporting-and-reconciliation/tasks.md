## 1. Data Model

- [x] 1.1 Add `aiCostEvents` to persist idempotent AI cost events
- [x] 1.2 Add `organizationAiCostMonthly` for monthly materialized summaries
- [x] 1.3 Add `aiBillingStatements` for manual monthly billed amounts

## 2. Backend Reporting

- [x] 2.1 Extract shared ledger utilities for period handling, event upsert, and monthly summary rebuilds
- [x] 2.2 Persist ledger events during live cost refresh and historical backfill
- [x] 2.3 Add organization range overview, monthly series, and conversation ranking queries
- [x] 2.4 Add platform overview, organization ranking, monthly series, and reconciliation queries
- [x] 2.5 Add mutation to upsert billing statements

## 3. Admin UI

- [x] 3.1 Extend organization AI cost tab with date range filters, KPI cards, monthly series, and CSV export
- [x] 3.2 Add a new `/admin/costs` page for global AI cost reporting
- [x] 3.3 Add reconciliation UI for billed statements and deltas
- [x] 3.4 Add admin navigation entry and route protection for the new page

## 4. Validation

- [x] 4.1 Verify idempotent event writes do not duplicate message costs
- [x] 4.2 Verify monthly summaries rebuild correctly after live refresh and backfill
- [x] 4.3 Run typecheck/lint for affected packages and document any pre-existing failures
