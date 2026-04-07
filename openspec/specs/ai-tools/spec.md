# AI Tools Specification

## Purpose
The AI agent system uses specialized tools to interact with the restaurant's data and external services (like WhatsApp). Each tool has a specific purpose and is invoked by the AI based on conversation context.

## Requirements

### Requirement: Send Product Image Tool
The AI agent SHALL have a tool to send product images to customers via WhatsApp when explicitly requested.

#### Scenario: Customer requests product image - image exists
- **WHEN** customer explicitly requests to see a product image (e.g., "mándame foto", "cómo se ve", "muéstrame")
- **AND** the product exists in the menu
- **AND** the product has an `imageUrl` configured
- **THEN** the AI uses `sendProductImageTool` with the product name
- **AND** the image is uploaded to WhatsApp Media API
- **AND** the image is sent to the customer
- **AND** a success response is returned to the AI

#### Scenario: Customer requests product image - no image available
- **WHEN** customer explicitly requests to see a product image
- **AND** the product exists but has no `imageUrl`
- **THEN** the AI receives a response indicating no image is available
- **AND** the response includes the product description as an alternative
- **AND** the AI offers to describe the product instead

#### Scenario: Customer requests product image - product not found
- **WHEN** customer explicitly requests to see a product image
- **AND** no product matches the requested name
- **THEN** the AI receives a response indicating product not found
- **AND** the AI asks the customer to be more specific

#### Scenario: Tool NOT used for general menu display
- **WHEN** customer asks to see the menu or browse products
- **THEN** the AI does NOT use `sendProductImageTool`
- **AND** uses `getMenuTool` or `searchMenuProductsTool` instead

### Requirement: WhatsApp Image Sending Helper
The system SHALL provide a helper function to send images via WhatsApp using external URLs.

#### Scenario: Send image from external URL
- **WHEN** `sendWhatsAppImageByUrl` is called with a valid image URL
- **THEN** the MIME type is determined from the URL extension
- **AND** the image is uploaded to WhatsApp Media API
- **AND** the image message is sent to the recipient
- **AND** the function completes without error

#### Scenario: Supported image formats
- **WHEN** sending an image with .jpg, .jpeg, or .png extension
- **THEN** the correct MIME type is used (image/jpeg or image/png)
- **AND** the image is sent successfully

### Requirement: System Prompt Instructions for Image Tool
The AI agent's system prompt SHALL include clear instructions for when to use the image sending tool.

#### Scenario: Prompt includes tool description
- **WHEN** the AI agent is initialized
- **THEN** the system prompt includes `sendProductImageTool` in the tools list
- **AND** describes it as "Envía la imagen de un producto específico cuando el cliente lo solicita explícitamente"

#### Scenario: Prompt includes usage guidelines
- **WHEN** the AI agent processes a conversation
- **THEN** the system prompt instructs to use the tool only for explicit image requests
- **AND** provides examples of trigger phrases ("mándame foto", "cómo se ve", "muéstrame")
- **AND** explicitly states NOT to use for general menu display
