## MODIFIED Requirements
### Requirement: Step 3 - Delivery Zones Configuration
The system SHALL allow configuring delivery zones with pricing using city templates and staged map-based editing before final persistence.

#### Scenario: Select city with predefined zones
- **WHEN** user enters onboarding Step 3
- **THEN** they can select a supported city (Bucaramanga or Bogotá)
- **AND** the system loads predefined zone templates for that city from backend templates storage
- **AND** zones are displayed on an interactive map and editable zone list

#### Scenario: Apply default values in bulk
- **WHEN** user sets default values (delivery fee, minimum order, estimated delivery time, default sucursal, active status)
- **THEN** they can apply defaults to selected zones or all zones in one action
- **AND** defaults are applied as a one-time bulk operation
- **AND** users can still override each zone individually afterwards

#### Scenario: Edit selected zone map polygon and fields
- **WHEN** user selects a zone in the list or map
- **THEN** the selected zone is highlighted on the map
- **AND** user can edit polygon points and zone fields (name, pricing, time, sucursal, active state)
- **AND** those edits remain staged until final submit

#### Scenario: Commit staged zones on continue
- **WHEN** user clicks "Guardar y continuar"
- **THEN** the system validates selected zones (polygon points, sucursal assignment, numeric fields)
- **AND** only selected zones are persisted to `deliveryAreas`
- **AND** onboarding Step 3 progress is marked complete with created zone count
- **AND** user proceeds to Step 4

#### Scenario: Keep single sucursal assignment per zone
- **WHEN** a zone is configured during onboarding Step 3
- **THEN** it is assigned to exactly one sucursal (`restaurantLocationId`)
- **AND** multi-sucursal zone assignment is not supported in this flow
