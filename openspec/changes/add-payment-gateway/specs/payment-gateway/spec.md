# Payment Gateway Specification

## Purpose
The payment gateway integration enables restaurants to collect payments via WhatsApp by sending payment links to customers. It supports Colombian payment methods (PSE, Nequi, Daviplata, cards) through Wompi or Epayco, with automatic payment confirmation and order status updates.

## Requirements

## ADDED Requirements

### Requirement: Payment Link Generation
The system SHALL generate unique payment links for orders using integrated payment gateways.

#### Scenario: Generate payment link for order
- **WHEN** a payment link is requested for an order
- **THEN** a unique payment link is generated via the payment gateway API
- **AND** the link includes the order amount and reference
- **AND** the link is valid for a configurable time period (default 24 hours)

#### Scenario: Payment link includes order details
- **WHEN** customer opens the payment link
- **THEN** the payment page shows: restaurant name, order total, order reference
- **AND** available payment methods are displayed

### Requirement: AI Payment Link Tool
The AI agent SHALL have a tool to send payment links to customers via WhatsApp.

#### Scenario: AI sends payment link after order confirmation
- **WHEN** customer confirms an order
- **AND** payment is required (configured by restaurant)
- **THEN** the AI uses `sendPaymentLinkTool` to generate and send the link
- **AND** the message includes payment instructions in Spanish

#### Scenario: AI explains payment process
- **WHEN** customer asks about payment
- **THEN** the AI explains available payment methods
- **AND** sends the payment link if order is pending payment

#### Scenario: Payment link sent via WhatsApp
- **WHEN** `sendPaymentLinkTool` is invoked
- **THEN** a WhatsApp message is sent with the payment link
- **AND** the message includes: amount, payment methods available, expiration time

### Requirement: Payment Confirmation Webhook
The system SHALL receive and process payment confirmations from the payment gateway.

#### Scenario: Successful payment webhook
- **WHEN** payment gateway sends a successful payment webhook
- **THEN** the webhook signature is verified
- **AND** the order's `paymentStatus` is updated to "paid"
- **AND** the payment record is created with gateway reference

#### Scenario: Send confirmation to customer
- **WHEN** payment is confirmed
- **THEN** a WhatsApp message is sent to the customer
- **AND** the message confirms payment received and order is being processed

#### Scenario: Handle duplicate webhooks
- **WHEN** the same webhook is received multiple times
- **THEN** the system processes it idempotently
- **AND** no duplicate records or messages are created

#### Scenario: Failed payment webhook
- **WHEN** payment gateway sends a failed payment webhook
- **THEN** the order's `paymentStatus` is updated to "failed"
- **AND** the AI can offer to resend the payment link

### Requirement: Payment Methods Support
The system SHALL support Colombian payment methods through the integrated gateway.

#### Scenario: PSE bank transfer
- **WHEN** customer selects PSE as payment method
- **THEN** they are redirected to their bank's portal
- **AND** payment confirmation is received via webhook

#### Scenario: Nequi payment
- **WHEN** customer selects Nequi
- **THEN** they can pay via Nequi app or push notification
- **AND** payment confirmation is received via webhook

#### Scenario: Daviplata payment
- **WHEN** customer selects Daviplata
- **THEN** they can pay via Daviplata app
- **AND** payment confirmation is received via webhook

#### Scenario: Card payment
- **WHEN** customer selects credit/debit card
- **THEN** they enter card details on secure payment page
- **AND** payment confirmation is received via webhook

### Requirement: Payment Status in Dashboard
The system SHALL display payment status in the order management interface.

#### Scenario: View payment status in order list
- **WHEN** viewing the orders list
- **THEN** each order shows payment status: pending, paid, failed
- **AND** status is visually distinct (color-coded)

#### Scenario: View payment details in order detail
- **WHEN** viewing an order detail page
- **THEN** payment information is displayed: status, method, gateway reference, paid at
- **AND** a "Enviar link de pago" button is available for unpaid orders

#### Scenario: Manual payment link sending
- **WHEN** admin clicks "Enviar link de pago" on an order
- **THEN** a new payment link is generated
- **AND** the link is sent to the customer via WhatsApp

### Requirement: Payment Gateway Configuration
The system SHALL allow configuration of payment gateway credentials.

#### Scenario: Configure Wompi credentials
- **WHEN** admin enters Wompi API credentials in settings
- **THEN** credentials are securely stored
- **AND** the system can generate payment links using Wompi

#### Scenario: Test mode configuration
- **WHEN** admin enables test mode
- **THEN** sandbox/test credentials are used
- **AND** no real payments are processed
