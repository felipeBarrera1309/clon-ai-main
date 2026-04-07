## ADDED Requirements

### Requirement: Product-Specific Combinations

The system SHALL support defining specific product-to-product combinations independent of categories.

#### Scenario: Configure combinable products

- **WHEN** restaurant admin edits a product
- **THEN** they SHALL be able to select specific products as "combinable"
- **AND** selection SHALL use a searchable multi-select picker
- **AND** combinations SHALL be stored per product

#### Scenario: Bot suggests specific combinations

- **WHEN** customer orders a product with combinable products defined
- **THEN** bot SHALL suggest the specific combinable products
- **AND** suggestion SHALL include product names and prices
- **EXAMPLE** "¿Quieres acompañar tu hamburguesa con papas grandes y gaseosa por $X?"

### Requirement: Required Product Combinations

The system SHALL support defining required product combinations where one product cannot be ordered without another.

#### Scenario: Configure required products

- **WHEN** restaurant admin edits a product
- **THEN** they SHALL be able to mark certain products as "required"
- **AND** required products SHALL be validated before order completion

#### Scenario: Validate required products

- **WHEN** customer tries to order a product with required dependencies
- **AND** required products are NOT in the order
- **THEN** bot SHALL inform customer of the requirement
- **AND** bot SHALL offer to add the required product
- **EXAMPLE** "La Promo Familiar requiere Gaseosa 1.5L. ¿La agrego al pedido?"

### Requirement: Coexistence with Category Combinations

The system SHALL support both category-based and product-specific combinations simultaneously.

#### Scenario: Both combination types active

- **WHEN** a product has category combinations AND product-specific combinations
- **THEN** product-specific combinations SHALL take precedence
- **OR** both SHALL be shown (configurable behavior)
