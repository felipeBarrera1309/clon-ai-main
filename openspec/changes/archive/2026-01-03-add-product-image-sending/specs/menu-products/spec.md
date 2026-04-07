## ADDED Requirements

### Requirement: Product Image URL Storage
The system SHALL store an optional external image URL for each menu product.

#### Scenario: Product created with image URL
- **WHEN** admin creates a product with a valid image URL
- **THEN** the URL is stored in the `imageUrl` field
- **AND** the product can be retrieved with its image URL

#### Scenario: Product created without image URL
- **WHEN** admin creates a product without an image URL
- **THEN** the `imageUrl` field is null/undefined
- **AND** the product functions normally without an image

### Requirement: Product Image URL in Dashboard Form
The system SHALL provide an input field for image URL in the product creation/edit form.

#### Scenario: Admin enters valid image URL
- **WHEN** admin enters a valid HTTPS URL in the image field
- **THEN** a live preview of the image is displayed below the input
- **AND** the form can be submitted successfully

#### Scenario: Admin enters invalid URL
- **WHEN** admin enters an invalid URL format
- **THEN** form validation displays an error message
- **AND** form submission is prevented

#### Scenario: Image preview fails to load
- **WHEN** the entered URL is valid but image fails to load
- **THEN** the preview element is hidden
- **AND** form submission is still allowed (URL validity is not server-verified)

### Requirement: Product Image Indicator in Dashboard
The system SHALL display a visual indicator for products that have an associated image.

#### Scenario: Product with image in table view
- **WHEN** viewing products in table layout
- **AND** a product has an `imageUrl` set
- **THEN** an image icon is displayed next to the product name
- **AND** hovering shows tooltip "Tiene imagen"

#### Scenario: Product with image in card view
- **WHEN** viewing products in card layout
- **AND** a product has an `imageUrl` set
- **THEN** an image icon replaces the default package icon in the card header

#### Scenario: Product without image
- **WHEN** viewing a product without `imageUrl`
- **THEN** no image indicator is shown (table view)
- **OR** default package icon is shown (card view)

### Requirement: Product Search by Name
The system SHALL provide an internal query to search products by name for AI tool usage.

#### Scenario: Search finds matching product
- **WHEN** AI tool searches for a product by name
- **AND** a product with matching name exists in the organization
- **THEN** the product details including `imageUrl` are returned

#### Scenario: Search finds no matching product
- **WHEN** AI tool searches for a product by name
- **AND** no product matches the search query
- **THEN** an empty result is returned
