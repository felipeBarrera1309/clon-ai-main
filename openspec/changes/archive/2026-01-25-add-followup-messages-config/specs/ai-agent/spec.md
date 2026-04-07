## ADDED Requirements

### Requirement: Dynamic Follow-up Sequence Builder

The system SHALL allow each organization to define a fully customizable sequence of follow-up messages with independent timing.

#### Scenario: Create multi-step follow-up sequence

- **WHEN** restaurant admin accesses follow-up configuration
- **THEN** they SHALL be able to add multiple follow-up steps (N steps, no limit)
- **AND** each step SHALL have a delay time (in minutes) from last customer interaction
- **AND** each step SHALL have a customizable message content
- **AND** steps SHALL be orderable via drag-and-drop

#### Scenario: Execute follow-up sequence on inactivity

- **WHEN** customer becomes inactive during conversation
- **AND** organization has configured follow-up sequence
- **THEN** system SHALL schedule first follow-up after configured delay
- **AND** if customer remains inactive, system SHALL send next follow-up per configured timing
- **AND** sequence SHALL stop when customer responds OR all messages sent

#### Scenario: Placeholder substitution in follow-ups

- **WHEN** follow-up message contains placeholders like `{customerName}` or `{restaurantName}`
- **THEN** system SHALL replace with actual values from conversation context
- **AND** missing placeholders SHALL be gracefully handled (empty string or default)

#### Scenario: Cancel sequence on customer response

- **WHEN** customer sends any message during follow-up sequence
- **THEN** system SHALL immediately cancel remaining scheduled follow-ups
- **AND** conversation SHALL continue normally with AI

#### Scenario: Default sequence for new organizations

- **WHEN** organization has not configured custom follow-up sequence
- **THEN** system SHALL use default sequence:
  - Step 1: 3 min → "¿Todavía sigues ahí? Estoy aquí para ayudarte 😊"
  - Step 2: 5 min → "Avísame si tienes alguna pregunta sobre el menú"
  - Step 3: 10 min → "Estaré aquí cuando estés listo para ordenar"

### Requirement: Follow-up Sequence UI Configuration

The dashboard SHALL provide an intuitive interface for configuring follow-up sequences.

#### Scenario: Add new follow-up step

- **WHEN** admin clicks "Agregar mensaje de seguimiento"
- **THEN** new step form SHALL appear with:
  - Delay input (minutes, min: 1, max: 1440)
  - Message text area with character count
  - Available placeholders list

#### Scenario: Edit existing follow-up step

- **WHEN** admin clicks edit on existing step
- **THEN** step SHALL become editable inline
- **AND** changes SHALL require save confirmation

#### Scenario: Delete follow-up step

- **WHEN** admin clicks delete on a step
- **THEN** confirmation dialog SHALL appear
- **AND** upon confirmation, step SHALL be removed
- **AND** remaining steps SHALL reorder automatically

#### Scenario: Reorder follow-up steps

- **WHEN** admin drags a step to new position
- **THEN** step order SHALL update
- **AND** delay times remain unchanged (each is relative to last interaction)

#### Scenario: Preview follow-up flow

- **WHEN** admin clicks "Vista previa"
- **THEN** timeline view SHALL show message sequence
- **AND** estimated send times SHALL be displayed
- **AND** placeholder values SHALL show sample data

#### Scenario: Reset to default sequence

- **WHEN** admin clicks "Restablecer valores predeterminados"
- **THEN** confirmation dialog SHALL appear
- **AND** upon confirmation, sequence SHALL reset to system default
