# Order Printing Specification

## Purpose
The order printing system enables restaurants to print order tickets (comandas) for kitchen preparation. It supports both automatic printing when orders arrive and manual batch printing for operational flexibility.

## Requirements

## ADDED Requirements

### Requirement: Order Ticket Layout
The system SHALL provide a print-optimized order ticket layout suitable for thermal printers.

#### Scenario: Print single order ticket
- **WHEN** user prints an order
- **THEN** the ticket displays: order number, date/time, items with quantities, special notes, customer name, phone, delivery address (if delivery)
- **AND** the layout is optimized for 80mm thermal printer width
- **AND** text is readable and properly formatted

#### Scenario: Print ticket with order notes
- **WHEN** an order has special instructions or item notes
- **THEN** notes are prominently displayed on the ticket
- **AND** notes are visually distinct from regular item text

### Requirement: Manual Order Printing
The system SHALL allow manual printing of individual orders from the order detail view.

#### Scenario: Print from order detail
- **WHEN** user clicks "Imprimir" on an order detail page
- **THEN** a print preview is shown
- **AND** user can proceed to print or cancel
- **AND** the browser print dialog opens with the ticket

#### Scenario: Print preview
- **WHEN** print preview is displayed
- **THEN** the ticket appears as it will print
- **AND** user can select printer and copies

### Requirement: New Order Notifications
The system SHALL notify staff when new orders arrive, regardless of current dashboard page.

#### Scenario: Pop-up notification for new order
- **WHEN** a new order is created
- **AND** user is on any dashboard page
- **THEN** a pop-up notification appears
- **AND** notification shows order summary (number, items count, total)
- **AND** notification includes "Imprimir comanda" button

#### Scenario: Browser notification when tab is inactive
- **WHEN** a new order is created
- **AND** the dashboard tab is not active
- **THEN** a browser notification is sent (if permissions granted)
- **AND** clicking the notification brings focus to the dashboard

#### Scenario: Audio alert for new orders
- **WHEN** a new order is created
- **AND** audio notifications are enabled in settings
- **THEN** an alert sound plays
- **AND** the sound is distinct and attention-grabbing

### Requirement: Batch Order Printing
The system SHALL allow printing multiple orders at once.

#### Scenario: Select multiple orders for printing
- **WHEN** user is in the orders list view
- **THEN** checkboxes are available to select multiple orders
- **AND** a "Imprimir seleccionados" button appears when orders are selected

#### Scenario: Print all pending orders
- **WHEN** user clicks "Imprimir todos pendientes"
- **THEN** all orders with status "pendiente" are queued for printing
- **AND** a combined print document is generated
- **AND** each order appears on a separate page/section

#### Scenario: Batch print generates combined document
- **WHEN** multiple orders are printed together
- **THEN** each order ticket is on a separate page
- **AND** orders are sorted by creation time
- **AND** a single print dialog handles all tickets

### Requirement: Auto-Print System
The system SHALL support automatic printing of new orders (optional feature).

#### Scenario: Enable auto-print
- **WHEN** admin enables auto-print in settings
- **AND** a new order is created
- **THEN** the print dialog automatically opens with the order ticket
- **AND** staff only needs to confirm the print

#### Scenario: Auto-print with location filter
- **WHEN** auto-print is enabled with a specific location filter
- **AND** a new order is created for that location
- **THEN** auto-print triggers
- **AND** orders for other locations do not trigger auto-print

#### Scenario: Disable auto-print
- **WHEN** admin disables auto-print
- **THEN** new orders only show notifications
- **AND** printing requires manual action

### Requirement: Print Settings
The system SHALL provide configuration options for printing behavior.

#### Scenario: Configure ticket size
- **WHEN** admin selects ticket size in settings
- **THEN** options include: 80mm (thermal), A4
- **AND** the selected size is used for all prints

#### Scenario: Configure notification sound
- **WHEN** admin toggles notification sound
- **THEN** audio alerts are enabled or disabled accordingly
- **AND** setting persists across sessions
