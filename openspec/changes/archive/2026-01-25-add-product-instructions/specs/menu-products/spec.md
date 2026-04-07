## ADDED Requirements

### Requirement: Product-Specific Instructions

The system SHALL support an optional instructions field per product that guides bot behavior when the product is ordered.

#### Scenario: Configure product instructions

- **WHEN** restaurant admin edits a product
- **THEN** they SHALL see an "Instrucciones del producto" text field
- **AND** field SHALL be optional
- **AND** field SHALL accept free-form text

#### Scenario: Bot follows question instructions

- **WHEN** customer orders a product with instructions
- **AND** instructions contain "Pregunta [something]"
- **THEN** bot SHALL ask the specified question before adding to order
- **EXAMPLE** Product "Pizza Personal" with instruction "Pregunta el sabor antes de agregar"
  - Bot: "¿Qué sabor de pizza personal deseas?"

#### Scenario: Bot follows customization instructions

- **WHEN** customer orders a product with customization instructions
- **AND** instructions specify options to offer
- **THEN** bot SHALL present the options to customer
- **EXAMPLE** Product "Jugos Naturales" with instruction "Pregunta si lo quiere en agua o en leche. Pregunta nivel de azúcar."
  - Bot: "¿Lo quieres en agua o en leche?" then "¿Qué nivel de azúcar prefieres?"

#### Scenario: Bot validates time-based instructions

- **WHEN** customer orders a product with time restriction in instructions
- **AND** instruction specifies availability hours
- **THEN** bot SHALL validate current time against restriction
- **EXAMPLE** Product "Plato del día" with instruction "Disponible solo de 12:00 p.m. a 3:00 p.m."
  - If ordered at 4 PM, bot informs product unavailable at this time

#### Scenario: Product without instructions

- **WHEN** customer orders a product with no instructions
- **THEN** bot SHALL process order normally without additional prompts
