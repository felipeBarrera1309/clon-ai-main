## 1. Ledger and Projection

- [x] 1.1 Remove free-text preview payload from `aiCostEvents.metadata`
- [x] 1.2 Rebuild conversation cost snapshots from persisted ledger rows after sync/backfill
- [x] 1.3 Keep reply-serving paths non-blocking when cost projection fails unexpectedly

## 2. Read Contracts

- [x] 2.1 Add internal read endpoints for conversation snapshot and ledger-event access
- [x] 2.2 Move admin conversation detail to ledger-first reads with preview hydration outside the ledger
- [x] 2.3 Stop organization cost reporting from aggregating totals out of `conversations.cost`

## 3. Repair and Migration

- [x] 3.1 Add an explicit ledger reconciliation/repair entrypoint for conversations
- [x] 3.2 Add a migration to strip legacy `textPreview` data from existing ledger rows

## 4. Validation

- [x] 4.1 Add or update targeted tests for ledger summary/projection behavior
- [x] 4.2 Run OpenSpec validation, backend typecheck, and targeted backend tests
- [x] 4.3 Document any remaining pre-existing repo validation failures
