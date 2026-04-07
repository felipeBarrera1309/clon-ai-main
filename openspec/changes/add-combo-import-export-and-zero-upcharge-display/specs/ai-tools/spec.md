## MODIFIED Requirements

### Requirement: Combo Message Formatting for Customers
AI combo presentation messages SHALL avoid showing zero upcharge markers.

#### Scenario: Zero upcharge option omits marker
- **WHEN** an option has `upcharge = 0`
- **THEN** `searchCombosTool` formatted customer text omits `(+$0)`
- **AND** only shows the option name

#### Scenario: Positive upcharge option keeps marker
- **WHEN** an option has `upcharge > 0`
- **THEN** `searchCombosTool` formatted customer text includes the upcharge marker
