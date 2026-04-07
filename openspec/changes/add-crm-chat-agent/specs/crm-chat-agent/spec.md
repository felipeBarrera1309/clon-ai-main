# CRM Chat Agent Specification

## Purpose
The CRM chat agent provides restaurant owners with a conversational interface to query business data and get platform support. It enables natural language queries about sales, orders, products, and customers without navigating complex dashboards.

## Requirements

## ADDED Requirements

### Requirement: Business Intelligence Chat Interface
The system SHALL provide a floating chat bubble in the dashboard for business queries.

#### Scenario: Open chat bubble
- **WHEN** user clicks the chat bubble icon
- **THEN** a chat window expands
- **AND** previous conversation history is displayed (if any)
- **AND** suggested questions are shown

#### Scenario: Minimize chat
- **WHEN** user minimizes the chat window
- **THEN** the chat collapses to the bubble icon
- **AND** conversation state is preserved
- **AND** the bubble remains accessible on all dashboard pages

#### Scenario: Chat persists across navigation
- **WHEN** user navigates to a different dashboard page
- **THEN** the chat bubble remains visible
- **AND** conversation history is maintained

### Requirement: Natural Language Business Queries
The system SHALL process natural language questions about business data.

#### Scenario: Query sales data
- **WHEN** user asks "¿Cuánto vendí ayer?" or similar sales question
- **THEN** the AI queries sales data for the specified period
- **AND** returns a formatted response with the total amount
- **AND** optionally includes comparison with previous period

#### Scenario: Query top products
- **WHEN** user asks "¿Cuáles son mis productos más vendidos?"
- **THEN** the AI queries product performance data
- **AND** returns a ranked list of top-selling products
- **AND** includes quantity sold and revenue

#### Scenario: Query by location
- **WHEN** user asks about a specific location (e.g., "¿Cómo van las ventas en la sucursal Centro?")
- **THEN** the AI filters data by the specified location
- **AND** returns location-specific metrics

#### Scenario: Query customer data
- **WHEN** user asks about customers (e.g., "¿Cuántos clientes nuevos tuve esta semana?")
- **THEN** the AI queries contact data
- **AND** returns customer metrics for the period

### Requirement: Context Filters
The system SHALL allow users to set context filters for queries.

#### Scenario: Set date range filter
- **WHEN** user selects a date range filter (today, yesterday, this week, this month, custom)
- **THEN** subsequent queries use this date range as default context
- **AND** the filter is displayed in the chat interface

#### Scenario: Set location filter
- **WHEN** user selects a specific location filter
- **THEN** subsequent queries are scoped to that location
- **AND** the filter can be cleared to query all locations

### Requirement: Platform Support
The system SHALL answer questions about platform usage and features.

#### Scenario: Answer how-to questions
- **WHEN** user asks "¿Cómo creo un nuevo producto?"
- **THEN** the AI provides step-by-step instructions
- **AND** optionally includes links to relevant dashboard sections

#### Scenario: Explain features
- **WHEN** user asks about a platform feature
- **THEN** the AI explains the feature's purpose and usage
- **AND** provides relevant examples

### Requirement: Response Visualization
The system SHALL display data responses in appropriate formats.

#### Scenario: Display numeric data
- **WHEN** AI returns numeric data (sales totals, counts)
- **THEN** the response includes formatted numbers with currency symbols
- **AND** optionally includes a simple chart or comparison

#### Scenario: Display list data
- **WHEN** AI returns list data (top products, recent orders)
- **THEN** the response is formatted as a readable list or table
- **AND** items are clickable to navigate to details (where applicable)
