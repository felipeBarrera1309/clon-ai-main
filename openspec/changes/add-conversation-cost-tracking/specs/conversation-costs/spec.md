## ADDED Requirements

### Requirement: Conversation AI Cost Aggregation

The system SHALL maintain an up-to-date AI cost total for each conversation by summing cost-bearing messages across every AI thread registered to that conversation.

#### Scenario: Primary thread message updates conversation total

- **WHEN** a support-agent run produces one or more thread messages with a valid `providerMetadata.gateway.cost`
- **THEN** the conversation total cost SHALL be recalculated without waiting for the conversation to be resolved
- **AND** `conversations.cost` SHALL reflect the sum of all registered thread costs for that conversation

#### Scenario: Auxiliary thread cost is included

- **WHEN** a tool creates an auxiliary AI thread linked to a conversation
- **AND** that auxiliary thread produces messages with valid cost metadata
- **THEN** the auxiliary thread cost SHALL be included in the conversation total

#### Scenario: Messages without cost metadata do not change totals

- **WHEN** a registered thread contains messages without valid cost metadata
- **THEN** those messages SHALL be ignored for cost aggregation
- **AND** the aggregation flow SHALL continue for the remaining messages

### Requirement: Platform Admin Cost Visibility

The system SHALL let platform admins inspect AI spend at organization aggregate and conversation detail level without exposing those costs in the organization dashboard.

#### Scenario: Organization admin view shows aggregate spend

- **WHEN** a platform admin opens an organization detail page
- **THEN** the UI SHALL show aggregate AI spend derived from cached conversation totals
- **AND** the UI SHALL include ranked conversations with their total AI cost

#### Scenario: Conversation detail shows per-message breakdown

- **WHEN** a platform admin opens a conversation cost detail view
- **THEN** the UI SHALL show the total AI cost for that conversation
- **AND** the UI SHALL provide a per-message breakdown with timestamp, thread purpose, role, token usage, model metadata, and cost

#### Scenario: No cost data available

- **WHEN** a conversation has no registered cost-bearing messages
- **THEN** the admin UI SHALL show an empty or zero-cost state
- **AND** the absence of cost data SHALL NOT break the admin conversation view

#### Scenario: Organization dashboard does not expose costs

- **WHEN** an organization user opens the operational conversations dashboard
- **THEN** the UI SHALL NOT expose conversation AI costs or message-level cost breakdowns

### Requirement: Platform-Admin Cost Access

The system SHALL expose cost data only to platform admins authorized to inspect the target organization.

#### Scenario: Authorized platform admin reads cost breakdown

- **WHEN** a platform admin requests cost breakdown for a conversation in a target organization
- **THEN** the system SHALL return the conversation cost summary and breakdown

#### Scenario: Non-platform-admin user is rejected

- **WHEN** a non-platform-admin user requests cost data
- **THEN** the system SHALL reject the request

#### Scenario: Platform admin with wrong organization context is rejected

- **WHEN** a platform admin requests cost breakdown for a conversation outside the provided organization
- **THEN** the system SHALL reject the request

### Requirement: Historical Cost Backfill

The system SHALL support backfilling historical conversation cost by organization using batched background execution.

#### Scenario: Historical backfill runs by organization

- **WHEN** an operator starts a historical cost backfill for an organization
- **THEN** the system SHALL process that organization's conversations in batches
- **AND** it SHALL persist progress so the job can resume safely

#### Scenario: Historical conversations may be estimated

- **WHEN** a historical conversation only has its primary thread reliably available
- **THEN** the system SHALL persist the backfilled cost with `costCoverage = "estimated"`
- **AND** the admin UI SHALL indicate that the historical cost may be incomplete
