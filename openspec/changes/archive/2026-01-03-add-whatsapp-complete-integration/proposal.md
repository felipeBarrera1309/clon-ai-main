# Change: Complete WhatsApp Business API Integration

## Why
The current WhatsApp integration is missing key features that improve user experience and enable better address validation:
1. **Typing indicator ("escribiendo...")**: Customers don't know when the bot is processing their message, leading to confusion and duplicate messages
2. **Read receipts (tick azul)**: Customers can't confirm their messages were received and read
3. **Location messages**: Customers can't send their delivery location directly via WhatsApp's native location sharing, forcing them to type addresses manually (error-prone)
4. **Send location**: Bot can't send restaurant location to customers for pickup orders

These features are standard in modern WhatsApp integrations and significantly improve the customer experience.

## What Changes

### 1. Typing Indicator (LIG-20)
- Add `sendTypingIndicator` function to `model/whatsapp.ts`
- Call typing indicator when message is received, before AI processing starts
- Typing indicator auto-dismisses after 25 seconds or when message is sent

### 2. Read Receipts / Mark as Read (LIG-21)
- Add `markMessageAsRead` function to `model/whatsapp.ts`
- Mark incoming messages as read when processed
- This shows blue ticks to the customer

### 3. Receive Location Messages (LIG-18)
- Update `lib/whatsappTypes.ts` to include location message type
- Update `lib/whatsapp.ts` `processIncomingMessage` to handle location messages
- Extract latitude, longitude, name, and address from location messages
- Use location data for address validation (integrate with `validateAddressTool`)

### 4. Send Location Messages (LIG-19)
- Add `sendWhatsAppLocationMessage` function to `model/whatsapp.ts`
- Create AI tool `sendRestaurantLocationTool` to send restaurant location on demand
- Useful for pickup orders or when customers ask "where are you located?"

### 5. Review Kevin's Implementation (LIG-22)
- Check if any of these features already exist in the codebase
- Reuse existing code where possible

## Impact
- Affected specs: `whatsapp-integration` (new)
- Affected code:
  - `packages/backend/convex/model/whatsapp.ts` - New functions
  - `packages/backend/convex/lib/whatsappTypes.ts` - Location message types
  - `packages/backend/convex/lib/whatsapp.ts` - Process location messages
  - `packages/backend/convex/system/whatsappAsyncProcessor.ts` - Typing + read receipts
  - `packages/backend/convex/webhooks.ts` - Typing + read receipts for widget
  - `packages/backend/convex/system/ai/tools/sendRestaurantLocation.ts` (NEW)
  - `packages/backend/convex/system/ai/tools/validateAddress.ts` - Accept location coordinates
  - `packages/backend/convex/system/ai/agents/supportAgent.ts` - Register new tool
  - `packages/backend/convex/system/ai/prompts/constants.ts` - Update prompt

## Linear Issues
- LIG-6: Integración Completa con WhatsApp (parent)
- LIG-18: Implementar lectura de ubicaciones
- LIG-19: Implementar envío de ubicaciones
- LIG-20: Mostrar indicador "escribiendo..."
- LIG-21: Implementar tick azul (read receipts)
- LIG-22: Revisar implementación de Kevin para reutilizar
