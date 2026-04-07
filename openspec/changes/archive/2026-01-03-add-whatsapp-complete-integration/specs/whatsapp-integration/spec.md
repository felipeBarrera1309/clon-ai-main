## ADDED Requirements

### Requirement: Typing Indicator
The system SHALL show a typing indicator ("escribiendo...") to customers while processing their messages.

#### Scenario: Typing indicator shown on message receive
- **WHEN** a customer sends a message via WhatsApp
- **THEN** the system sends a typing indicator to the customer
- **AND** the typing indicator appears in the customer's WhatsApp chat
- **AND** the typing indicator dismisses when the bot responds or after 25 seconds

#### Scenario: Typing indicator for text messages
- **WHEN** a customer sends a text message
- **THEN** the typing indicator is sent before AI processing begins

#### Scenario: Typing indicator for media messages
- **WHEN** a customer sends an image or audio message
- **THEN** the typing indicator is sent before media processing begins

### Requirement: Read Receipts
The system SHALL mark customer messages as read (blue ticks) after processing.

#### Scenario: Message marked as read after processing
- **WHEN** a customer message is successfully processed
- **THEN** the system marks the message as read via WhatsApp API
- **AND** the customer sees blue ticks on their message

#### Scenario: Previous messages also marked as read
- **WHEN** a message is marked as read
- **THEN** all previous messages in the conversation are also marked as read
- **AND** this is standard WhatsApp API behavior

### Requirement: Receive Location Messages
The system SHALL receive and process location messages sent by customers via WhatsApp.

#### Scenario: Customer sends location via WhatsApp
- **WHEN** a customer sends a location message using WhatsApp's location sharing feature
- **THEN** the system extracts latitude, longitude, name, and address from the message
- **AND** the location data is stored with the conversation

#### Scenario: Location used for address validation
- **WHEN** a customer sends a location message
- **AND** the conversation is in the address validation phase
- **THEN** the system uses the coordinates to validate the delivery area
- **AND** the AI confirms the delivery address with the customer

#### Scenario: Location message without coordinates
- **WHEN** a location message is received without valid coordinates
- **THEN** the system logs an error
- **AND** asks the customer to share their location again

### Requirement: Send Location Messages
The system SHALL be able to send location messages to customers via WhatsApp.

#### Scenario: Send restaurant location on request
- **WHEN** a customer asks for the restaurant location (e.g., "¿dónde están?", "ubicación")
- **THEN** the AI uses `sendRestaurantLocationTool` to send the restaurant's location
- **AND** the customer receives a location message with the restaurant's coordinates

#### Scenario: Send location for pickup orders
- **WHEN** a customer places a pickup order
- **AND** asks where to pick up
- **THEN** the AI sends the restaurant location for the selected branch

#### Scenario: Restaurant without coordinates
- **WHEN** the AI tries to send a restaurant location
- **AND** the restaurant location doesn't have coordinates configured
- **THEN** the AI responds with the restaurant's text address instead
- **AND** suggests the customer search for the address

### Requirement: WhatsApp Location Message Types
The system SHALL support the WhatsApp location message format in webhook processing.

#### Scenario: Parse incoming location message
- **WHEN** a webhook payload contains a location message type
- **THEN** the system extracts: latitude, longitude, name (optional), address (optional)
- **AND** creates a structured location object for processing

#### Scenario: Send outgoing location message
- **WHEN** sending a location message via WhatsApp API
- **THEN** the system sends: latitude, longitude, name, address
- **AND** the message appears as a clickable location in WhatsApp
