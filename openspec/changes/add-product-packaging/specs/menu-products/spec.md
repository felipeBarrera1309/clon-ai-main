## ADDED Requirements

### Requirement: Product Packaging Cost

The system SHALL support an optional packaging cost property for menu products that is automatically added to the product price when calculating order totals.

#### Scenario: Product with packaging cost

- **WHEN** a product has a `packagingCost` value configured (e.g., $1,000 COP)
- **AND** customer orders that product at base price $12,000 COP
- **THEN** the total displayed to customer SHALL be $13,000 COP (base + packaging)
- **AND** the order summary SHALL show the packaging cost breakdown

#### Scenario: Product without packaging cost

- **WHEN** a product has no `packagingCost` value (null or 0)
- **AND** customer orders that product at base price $10,000 COP
- **THEN** the total displayed SHALL be $10,000 COP
- **AND** no packaging line item SHALL appear in the summary

#### Scenario: Dashboard packaging management

- **WHEN** restaurant admin views the menu products table
- **THEN** a "Empaque" column SHALL be visible
- **AND** the column SHALL be editable inline like other product properties
- **AND** values SHALL be formatted as Colombian peso currency

#### Scenario: Multiple products with packaging in order

- **WHEN** customer orders multiple products with packaging costs
- **THEN** each product's packaging cost SHALL be calculated individually
- **AND** the order total SHALL include sum of all packaging costs
