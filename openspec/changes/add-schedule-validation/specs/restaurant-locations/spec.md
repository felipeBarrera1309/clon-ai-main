## ADDED Requirements

### Requirement: Independent Delivery Type Schedules

The system SHALL support independent schedule configurations for delivery and pickup services per restaurant location, separate from general operating hours.

#### Scenario: Configure delivery schedule

- **WHEN** restaurant admin configures a location
- **THEN** they SHALL be able to set delivery hours independently from general hours
- **AND** delivery schedule SHALL support different hours per day of week
- **AND** delivery schedule MAY be left empty (defaults to general hours)

#### Scenario: Configure pickup schedule

- **WHEN** restaurant admin configures a location
- **THEN** they SHALL be able to set pickup hours independently from general hours
- **AND** pickup schedule SHALL support different hours per day of week
- **AND** pickup schedule MAY be left empty (defaults to general hours)

### Requirement: Schedule Validation on Address Confirmation

The system SHALL validate delivery type availability when confirming customer address, based on the assigned location's schedules.

#### Scenario: Location fully open

- **WHEN** customer confirms address at 6:00 PM
- **AND** assigned location has general hours 11 AM - 11 PM
- **AND** delivery hours are 11 AM - 10 PM
- **AND** customer requested delivery
- **THEN** the order flow SHALL continue normally

#### Scenario: Delivery closed but pickup available

- **WHEN** customer confirms address at 10:15 PM
- **AND** assigned location has delivery hours until 10:00 PM
- **AND** pickup hours are until 11:00 PM
- **AND** customer requested delivery
- **THEN** bot SHALL inform delivery is unavailable at this time
- **AND** bot SHALL offer to switch to pickup
- **AND** bot SHALL offer to schedule the order for later

#### Scenario: Pickup closed but delivery available

- **WHEN** customer confirms address for pickup
- **AND** pickup hours have ended
- **AND** delivery hours are still active
- **THEN** bot SHALL inform pickup is unavailable
- **AND** bot SHALL offer to switch to delivery
- **AND** bot SHALL offer to schedule the order

#### Scenario: Location completely closed

- **WHEN** customer confirms address
- **AND** location's general hours indicate closed
- **THEN** bot SHALL inform the location is closed
- **AND** bot SHALL offer to schedule the order for when location opens
- **AND** bot SHALL NOT offer delivery type alternatives

### Requirement: Bot Alternative Suggestions

The system SHALL provide helpful alternatives when requested delivery type is unavailable.

#### Scenario: Alternative delivery type available

- **WHEN** requested delivery type is unavailable
- **AND** alternative delivery type IS available
- **THEN** bot response SHALL include option to switch delivery type
- **AND** response SHALL clearly state availability hours for each option

#### Scenario: Schedule order suggestion

- **WHEN** any delivery type is unavailable due to schedule
- **THEN** bot SHALL offer to schedule the order
- **AND** bot MAY suggest the next available time slot
