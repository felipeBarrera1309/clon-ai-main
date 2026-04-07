## ADDED Requirements

### Requirement: Canonical Organization Thread Coverage

The system SHALL maintain a canonical inventory of AI threads for each organization with explicit resolution and synchronization state.

#### Scenario: Thread resolved to conversation

- **WHEN** a thread can be deterministically mapped to a conversation in the same organization
- **THEN** the inventory SHALL mark it as resolved to `conversation`
- **AND** it SHALL retain the resolved `conversationId`

#### Scenario: Thread resolved as organization-unassigned

- **WHEN** a thread belongs to the organization but has no reliable conversation mapping
- **THEN** the inventory SHALL mark it as resolved to `organization_unassigned`
- **AND** its cost SHALL remain available at organization level

#### Scenario: Thread ignored explicitly

- **WHEN** a thread is intentionally excluded from coverage
- **THEN** the inventory SHALL mark it as `ignored`
- **AND** it SHALL not contribute to cost totals or block organization completeness

### Requirement: Auditable Historical Cost Processing

The system SHALL record entity-level audit entries for historical AI cost processing so platform admins can understand what happened during each job.

#### Scenario: Entity-level audit trail

- **WHEN** the pipeline inventories, resolves, or syncs a thread or conversation
- **THEN** the system SHALL append an audit record with `jobId`, phase, entity, outcome, and reason metadata

#### Scenario: Retry only failed entities

- **WHEN** a platform admin launches a `failed_only` retry
- **THEN** the pipeline SHALL limit processing to entities currently marked as failed
- **AND** it SHALL append new audit entries for the retry attempt instead of mutating historical ones

### Requirement: Organization Coverage Status

The system SHALL expose a persisted organization-level coverage status derived from the canonical thread inventory.

#### Scenario: Complete organization

- **WHEN** all relevant discovered threads are resolved and synchronized without pending failures
- **THEN** the organization coverage SHALL be marked `complete`

#### Scenario: Partial organization

- **WHEN** any relevant discovered thread remains pending or failed
- **THEN** the organization coverage SHALL be marked `partial`

#### Scenario: Running organization backfill

- **WHEN** a historical cost backfill job is actively processing an organization
- **THEN** the organization coverage SHALL be marked `running`
