## ADDED Requirements

### Requirement: System Prompt Change Audit Trail
The system SHALL persist an immutable audit event whenever an organization system prompt text changes through supported prompt configuration flows.

#### Scenario: Prompt update stores full before and after snapshots
- **WHEN** a prompt text field is updated for an organization
- **THEN** the system stores an audit event with the organization, timestamp, actor metadata, source, action, and changed fields
- **AND** the event stores full prompt snapshots for both before and after states

#### Scenario: Prompt reset stores full before and after snapshots
- **WHEN** one or more prompt text fields are reset for an organization
- **THEN** the system stores an audit event with the organization, timestamp, actor metadata, source, action, and changed fields
- **AND** the event stores full prompt snapshots for both before and after states

#### Scenario: No-op saves do not create audit noise
- **WHEN** a prompt write operation does not produce any effective prompt text change
- **THEN** the system does not create an audit event

### Requirement: Prompt Audit Retrieval by Organization
The system SHALL provide organization-scoped, paginated access to prompt audit events for authorized users.

#### Scenario: Private organization audit retrieval
- **WHEN** an authenticated organization user requests prompt audit events for an organization
- **THEN** the system returns paginated events filtered by organization
- **AND** events are ordered by change timestamp descending

#### Scenario: Superadmin audit retrieval
- **WHEN** a platform admin requests prompt audit events for an organization
- **THEN** the system returns paginated events filtered by organization
- **AND** events are ordered by change timestamp descending
