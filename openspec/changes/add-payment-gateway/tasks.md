## 1. Research & Planning
- [ ] 1.1 Review Wompi API documentation
- [ ] 1.2 Review Epayco API documentation
- [ ] 1.3 Decide primary gateway (recommend Wompi for PSE/Nequi/Daviplata support)
- [ ] 1.4 Document API integration requirements

## 2. Schema & Backend
- [ ] 2.1 Create `paymentConfigurations` table (gateway, apiKey, secretKey, webhookSecret, organizationId)
- [ ] 2.2 Create `payments` table (orderId, amount, status, gatewayReference, paymentMethod, paidAt)
- [ ] 2.3 Add `paymentStatus` field to orders table
- [ ] 2.4 Create `createPaymentLink` mutation
- [ ] 2.5 Create `getPaymentStatus` query
- [ ] 2.6 Create webhook endpoint for payment confirmations

## 3. Payment Gateway Integration
- [ ] 3.1 Create `lib/wompi.ts` with API client
- [ ] 3.2 Implement `createPaymentLink` function (generates unique link per order)
- [ ] 3.3 Implement `verifyPayment` function
- [ ] 3.4 Implement webhook signature verification
- [ ] 3.5 Handle payment methods: PSE, Nequi, Daviplata, credit/debit cards

## 4. AI Tool Integration
- [ ] 4.1 Create `sendPaymentLinkTool` in `system/ai/tools/`
- [ ] 4.2 Tool generates payment link for current order
- [ ] 4.3 Tool sends link via WhatsApp with payment instructions
- [ ] 4.4 Register tool in `supportAgent.ts`
- [ ] 4.5 Update system prompt with payment flow instructions

## 5. Payment Confirmation Flow
- [ ] 5.1 Create webhook handler for Wompi/Epayco callbacks
- [ ] 5.2 Update order `paymentStatus` on successful payment
- [ ] 5.3 Send WhatsApp confirmation message to customer
- [ ] 5.4 Handle failed/cancelled payments
- [ ] 5.5 Implement idempotency for webhook retries

## 6. Dashboard UI
- [ ] 6.1 Add payment status indicator to order list/detail views
- [ ] 6.2 Create payment gateway settings page
- [ ] 6.3 Add API key configuration form
- [ ] 6.4 Create payment history view per order
- [ ] 6.5 Add manual "Enviar link de pago" button in order detail

## 7. Testing & Validation
- [ ] 7.1 Test payment link generation in sandbox mode
- [ ] 7.2 Test webhook handling with test payments
- [ ] 7.3 Verify order status updates correctly
- [ ] 7.4 Test WhatsApp message sending
- [ ] 7.5 Verify linting passes on all modified files
