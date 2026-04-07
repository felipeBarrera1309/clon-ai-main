## ADDED Requirements

### Requirement: Manual Billing Statement Capture

The system SHALL allow platform admins to store billed AI amounts per month and provider.

#### Scenario: Upsert monthly billed amount

- **WHEN** a platform admin saves a billed amount for a month and provider
- **THEN** the system SHALL create or update the billing statement for that unique `(periodMonth, provider)` pair

### Requirement: Monthly Reconciliation Visibility

The system SHALL let platform admins compare modeled AI cost against billed AI cost by month.

#### Scenario: Reconciliation summary

- **WHEN** a platform admin requests reconciliation for a month range
- **THEN** the system SHALL return modeled cost, billed cost, delta amount, and delta percentage per month

#### Scenario: Missing billed statement

- **WHEN** a month has modeled cost but no billed statement
- **THEN** the reconciliation view SHALL show the billed amount as missing without breaking the report
