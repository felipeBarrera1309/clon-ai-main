## MODIFIED Requirements

### Requirement: Organization AI Cost Range Reporting

The system SHALL let platform admins inspect AI cost for a single organization within an arbitrary date range, including monthly buckets derived from event timestamps, while preserving visibility into whether the organization historical coverage is complete or partial.

#### Scenario: Organization range overview with coverage state

- **WHEN** a platform admin selects a date range for an organization
- **THEN** the system SHALL return the total cost inside the range
- **AND** it SHALL return the total conversations and events contributing to that range
- **AND** it SHALL include the organization coverage status so the UI can distinguish complete vs partial history

#### Scenario: Organization reporting fallback only for partial coverage

- **WHEN** an organization has partial or not-started ledger coverage
- **THEN** the reporting layer MAY fall back to legacy conversation totals for conversation-centric views
- **BUT** organizations marked complete SHALL report only from ledger-backed data

### Requirement: Global AI Cost Reporting

The system SHALL let platform admins inspect AI cost across all organizations from a single admin surface, including operational visibility into coverage status and pending failures.

#### Scenario: Global coverage operations

- **WHEN** a platform admin opens the global AI cost reporting page
- **THEN** the system SHALL expose a coverage-oriented listing of organizations
- **AND** each row SHALL show whether the organization is `not_started`, `running`, `partial`, or `complete`
- **AND** each row SHALL expose pending/failing coverage information or a retry affordance
