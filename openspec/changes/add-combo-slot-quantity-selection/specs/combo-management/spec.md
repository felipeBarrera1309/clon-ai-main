## ADDED Requirements

### Requirement: Quantity-Based Combo Slot Selection
The combo ordering system SHALL support quantity-based option selection inside combo slots.

#### Scenario: Exact slot rule with repetition
- **WHEN** a slot is configured with `minSelections = maxSelections = 3`
- **AND** the customer selects 2 units of option A and 1 unit of option B
- **THEN** the slot SHALL be considered valid
- **AND** the order payload SHALL store each selected option with its `quantity`

#### Scenario: Exceeding slot maximum by quantity
- **WHEN** a slot is configured with `maxSelections = 2`
- **AND** the customer attempts to select quantities that sum to 3
- **THEN** the slot SHALL be rejected with a validation error

### Requirement: Combo Pricing with Slot Quantities
Combo pricing SHALL include upcharges multiplied by selected quantities per slot option.

#### Scenario: Price calculation with repeated charged options
- **WHEN** a combo has base price `X`
- **AND** one selected slot option has upcharge `Y` with quantity `2`
- **THEN** the combo unit price SHALL be calculated as `X + (Y * 2)`

### Requirement: Dashboard Combo Picker Quantity Controls
The dashboard combo picker SHALL allow quantity controls for multiselect slots.

#### Scenario: Multiselect slot uses steppers
- **WHEN** a slot allows multiple selections (`maxSelections > 1`)
- **THEN** the picker SHALL render per-option quantity controls (`- / +`)
- **AND** prevent increments when the slot reaches `maxSelections`
- **AND** show current selected count against slot limit
