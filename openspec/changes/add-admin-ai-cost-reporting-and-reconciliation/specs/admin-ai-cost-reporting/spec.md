## ADDED Requirements

### Requirement: Organization AI Cost Range Reporting

The system SHALL let platform admins inspect AI cost for a single organization within an arbitrary date range, including monthly buckets derived from event timestamps.

#### Scenario: Organization range overview

- **WHEN** a platform admin selects a date range for an organization
- **THEN** the system SHALL return the total cost inside the range
- **AND** it SHALL return the total conversations and events contributing to that range

#### Scenario: Organization monthly series

- **WHEN** a platform admin requests monthly reporting for an organization
- **THEN** the system SHALL return a month-by-month series based on event timestamps
- **AND** months without consumption SHALL still appear with zero values

#### Scenario: Organization conversation ranking in range

- **WHEN** a platform admin lists organization conversations for a date range
- **THEN** each row SHALL include `costInRange`
- **AND** each row SHALL preserve the conversation lifetime cost separately

### Requirement: Global AI Cost Reporting

The system SHALL let platform admins inspect AI cost across all organizations from a single admin surface.

#### Scenario: Global range overview

- **WHEN** a platform admin opens the global AI cost reporting page
- **THEN** the system SHALL return the total cost, conversations, organizations, and events for the selected date range

#### Scenario: Global organization ranking

- **WHEN** a platform admin lists organizations by AI cost for a date range
- **THEN** the system SHALL rank organizations using cost aggregated from events within that range
- **AND** each row SHALL include a linkable organization identifier
