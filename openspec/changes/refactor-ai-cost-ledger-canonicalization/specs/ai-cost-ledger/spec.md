## ADDED Requirements

### Requirement: Canonical AI Cost Ledger

The system SHALL persist AI cost facts in immutable ledger events and SHALL treat those ledger rows as the application source of truth for analytics and reconciliation.

#### Scenario: Ledger row stores only stable scalar metadata

- **WHEN** the system persists or updates an AI cost event
- **THEN** the ledger row SHALL store scalar metadata such as `role`, `threadPurpose`, and `isCustomerVisible`
- **AND** it SHALL NOT persist free-text previews or other debug transcript fragments in the ledger metadata

#### Scenario: Conversation snapshot is projected from ledger rows

- **WHEN** a conversation cost refresh or historical backfill completes successfully
- **THEN** the system SHALL rebuild `conversations.cost` and related trust fields from the persisted `aiCostEvents` rows for that conversation
- **AND** it SHALL NOT derive the final snapshot directly from the transient in-memory thread scan result

### Requirement: Non-Blocking Cost Projection

The system SHALL treat cost projection as a best-effort projection step that cannot block reply delivery.

#### Scenario: Unexpected ledger sync failure during serving path

- **WHEN** the ledger sync or snapshot rebuild fails unexpectedly during an agent reply flow
- **THEN** the system SHALL preserve the last known conversation snapshot
- **AND** it SHALL record sync failure metadata on the conversation
- **AND** it SHALL allow the reply-serving flow to continue

### Requirement: Layered AI Cost Read Contract

The system SHALL enforce a consistent read contract across conversation UI, admin drilldown, and reporting queries.

#### Scenario: Conversation UI reads snapshot cache

- **WHEN** a consumer needs the current cost for a single conversation
- **THEN** it SHALL read the conversation snapshot fields from `conversations`
- **AND** it SHALL use trust metadata such as `costCoverage` and last sync error fields to interpret that snapshot

#### Scenario: Admin drilldown reads ledger events

- **WHEN** a platform admin opens a per-conversation AI cost detail view
- **THEN** the detail rows SHALL be built from `aiCostEvents`
- **AND** any optional text preview SHALL be hydrated separately from agent thread messages using `messageId`

#### Scenario: Reporting avoids conversation snapshot aggregation

- **WHEN** an organization or global AI cost report aggregates totals across conversations
- **THEN** the report SHALL aggregate from `aiCostEvents` and/or `organizationAiCostMonthly`
- **AND** it SHALL NOT sum totals from `conversations.cost`

### Requirement: Explicit Ledger Reconciliation

The system SHALL expose an explicit reconciliation workflow for comparing source scans, ledger rows, and conversation snapshots.

#### Scenario: Reconciliation surfaces divergence without implicit repair

- **WHEN** an operator runs reconciliation for a conversation without requesting repair
- **THEN** the system SHALL return the source-derived summary, ledger-derived summary, snapshot state, and any message-level divergence indicators
- **AND** it SHALL NOT mutate the ledger or conversation snapshot implicitly

#### Scenario: Reconciliation repairs on demand

- **WHEN** an operator runs reconciliation for a conversation with repair enabled
- **THEN** the system SHALL attempt to rescan threads, repair the ledger, and rebuild the conversation snapshot
- **AND** it SHALL report whether the repair synchronized successfully, skipped due to incomplete thread fetches, or failed unexpectedly
