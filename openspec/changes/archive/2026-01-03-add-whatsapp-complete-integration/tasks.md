## 1. Research & Planning (LIG-22)
- [x] 1.1 Search codebase for existing typing indicator implementation
- [x] 1.2 Search codebase for existing read receipt implementation
- [x] 1.3 Search codebase for existing location message handling
- [x] 1.4 Document findings and reusable code

## 2. Typing Indicator (LIG-20)
- [x] 2.1 Add `sendTypingIndicator` function to `model/whatsapp.ts`
- [x] 2.2 Call typing indicator in `whatsappAsyncProcessor.ts` when message received
- [~] 2.3 Call typing indicator in `webhooks.ts` (widget) - SKIPPED: Widget doesn't use WhatsApp API
- [x] 2.4 Test typing indicator appears in WhatsApp client

## 3. Read Receipts (LIG-21)
- [x] 3.1 Add `markMessageAsRead` function to `model/whatsapp.ts`
- [x] 3.2 Call mark as read in `whatsappAsyncProcessor.ts` after processing message
- [~] 3.3 Call mark as read in `webhooks.ts` (widget) - SKIPPED: Widget doesn't use WhatsApp API
- [x] 3.4 Test blue ticks appear in WhatsApp client

## 4. Receive Location Messages (LIG-18)
- [x] 4.1 Add `WhatsAppLocationMessage` type to `lib/whatsappTypes.ts` (already existed, added to union)
- [x] 4.2 Update `processIncomingMessage` in `lib/whatsapp.ts` to handle location type
- [x] 4.3 Update `whatsappAsyncProcessor.ts` to process location messages
- [~] 4.4 Update `webhooks.ts` (widget) - SKIPPED: Widget doesn't use WhatsApp API
- [~] 4.5 Create helper to convert location coordinates to address - SKIPPED: Not needed, AI handles text
- [~] 4.6 Integrate location data with `validateAddressTool` - SKIPPED: Location passed as text to AI
- [x] 4.7 Test receiving location from WhatsApp client

## 5. Send Location Messages (LIG-19)
- [x] 5.1 Add `sendWhatsAppLocationMessage` function to `model/whatsapp.ts`
- [x] 5.2 Create `sendRestaurantLocationTool` AI tool
- [x] 5.3 Register tool in `supportAgent.ts`
- [x] 5.4 Update system prompt with tool usage instructions
- [x] 5.5 Test sending location to WhatsApp client

## 6. Integration & Testing
- [x] 6.1 Verify all functions compile without errors
- [x] 6.2 Test complete flow: receive message → typing → process → read receipt → respond
- [x] 6.3 Test location receive → validate address flow
- [x] 6.4 Test send restaurant location flow
- [x] 6.5 Verify linting passes on all modified files
