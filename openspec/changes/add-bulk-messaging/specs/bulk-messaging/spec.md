# Bulk Messaging Specification

## Purpose
The bulk messaging system enables restaurants to send promotional messages, announcements, and reminders to multiple customers simultaneously via WhatsApp. This supports marketing campaigns, special offers, and customer re-engagement strategies.

## Requirements

## ADDED Requirements

### Requirement: Message Template Management
The system SHALL provide a template management system for reusable message content.

#### Scenario: Create message template with variables
- **WHEN** admin creates a template with placeholder variables (e.g., {{nombre}}, {{ultimoPedido}})
- **THEN** the template is saved with the variables identified
- **AND** the template can be used in campaigns

#### Scenario: Preview template with sample data
- **WHEN** admin previews a template
- **THEN** variables are replaced with sample data
- **AND** the preview shows how the message will appear to recipients

#### Scenario: Edit existing template
- **WHEN** admin edits a template
- **AND** the template is not currently used in an active campaign
- **THEN** the changes are saved
- **AND** future campaigns using this template will use the updated content

### Requirement: Campaign Creation
The system SHALL allow creation of messaging campaigns with recipient selection and scheduling.

#### Scenario: Create immediate campaign
- **WHEN** admin creates a campaign with "send now" option
- **AND** selects a template and recipients
- **THEN** the campaign is created with status "sending"
- **AND** messages begin sending immediately

#### Scenario: Create scheduled campaign
- **WHEN** admin creates a campaign with a future date/time
- **THEN** the campaign is created with status "scheduled"
- **AND** messages will be sent at the scheduled time

#### Scenario: Filter recipients by criteria
- **WHEN** admin selects recipients using filters
- **THEN** available filters include: all contacts, last order date range, specific location, order frequency
- **AND** the recipient count is displayed before confirmation

### Requirement: Bulk Message Sending
The system SHALL send messages to multiple recipients while respecting WhatsApp API rate limits.

#### Scenario: Send messages with rate limiting
- **WHEN** a campaign is executed
- **THEN** messages are sent in batches respecting WhatsApp API limits
- **AND** delivery status is tracked per recipient
- **AND** failed messages are retried up to 3 times

#### Scenario: Variable substitution in messages
- **WHEN** a message is sent to a recipient
- **THEN** template variables are replaced with recipient-specific data
- **AND** the personalized message is sent via WhatsApp

#### Scenario: Handle delivery failures
- **WHEN** a message fails to deliver after retries
- **THEN** the recipient status is marked as "failed"
- **AND** the error reason is logged
- **AND** the campaign continues with remaining recipients

### Requirement: Campaign Analytics
The system SHALL provide analytics and reporting for messaging campaigns.

#### Scenario: View campaign delivery statistics
- **WHEN** admin views a campaign detail page
- **THEN** statistics are displayed: total sent, delivered, failed, read (if available)
- **AND** delivery rate percentage is calculated

#### Scenario: View recipient-level status
- **WHEN** admin views campaign recipients
- **THEN** each recipient shows: name, phone, status, sent time, delivered time, error (if any)
- **AND** recipients can be filtered by status

#### Scenario: Export campaign results
- **WHEN** admin exports campaign results
- **THEN** a CSV file is generated with all recipient data and delivery status
