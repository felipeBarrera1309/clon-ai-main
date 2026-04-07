## ADDED Requirements

### Requirement: Automatic Order Status Completion

The system SHALL automatically advance orders to their final status based on delivery type and estimated completion time, preventing stale "active" orders.

#### Scenario: Delivery order auto-completion

- **WHEN** a delivery order has status `en_camino` (on the way)
- **AND** estimated delivery time + buffer period has elapsed
- **THEN** order status SHALL automatically change to `entregado` (delivered)
- **AND** order SHALL no longer be considered "active"

#### Scenario: Pickup order auto-completion

- **WHEN** a pickup order has status `listo_para_recoger` (ready for pickup)
- **AND** pickup window + buffer period has elapsed
- **THEN** order status SHALL automatically change to `entregado` (delivered)
- **AND** order SHALL no longer be considered "active"

#### Scenario: New order after auto-completion

- **WHEN** customer sends new message to start an order
- **AND** previous order was auto-completed
- **THEN** bot SHALL start fresh order flow
- **AND** bot SHALL NOT reference the previous completed order

#### Scenario: Manual override of auto-completed order

- **WHEN** restaurant admin views an auto-completed order
- **THEN** they SHALL be able to change the status manually
- **AND** manual changes SHALL take precedence over auto-completion

### Requirement: Configurable Auto-Completion Buffer

The system SHALL allow configuration of the buffer time before auto-completing orders.

#### Scenario: Configure buffer time

- **WHEN** restaurant admin accesses organization settings
- **THEN** they SHALL be able to set auto-completion buffer in minutes
- **AND** default buffer SHALL be 30 minutes
- **AND** buffer SHALL apply to both delivery and pickup orders
