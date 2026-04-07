# Change: Add Product Image Sending via WhatsApp

## Why
Zirus Pizza (client) needs the AI bot to send product photos when customers explicitly request them ("mándame foto", "cómo se ve", "muéstrame"). Images should NOT be sent automatically - only on explicit customer demand. This enhances the customer experience by allowing visual product exploration during the ordering conversation.

## What Changes
- **Schema**: Replace `imageStorageId` with `imageUrl` field in `menuProducts` table to support external image URLs
- **Dashboard**: Add `imageUrl` input field to product form with live preview
- **Dashboard UI**: Show image indicator icons in product table and card views
- **Backend**: Create `sendWhatsAppImageByUrl` helper function for WhatsApp Media API integration
- **AI Tool**: Create new `sendProductImageTool` for the AI agent to send product images on demand
- **AI Prompt**: Update system prompt with instructions for when to use the image tool

## Impact
- Affected specs: `menu-products`, `ai-tools`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/private/menuProducts.ts`
  - `packages/backend/convex/system/menuProducts.ts`
  - `packages/backend/convex/model/whatsapp.ts`
  - `packages/backend/convex/system/ai/tools/sendProductImage.ts` (NEW)
  - `packages/backend/convex/system/ai/agents/supportAgent.ts`
  - `packages/backend/convex/system/ai/prompts/constants.ts`
  - `apps/web/modules/dashboard/ui/components/menu-product-builder-form.tsx`
  - `apps/web/modules/dashboard/ui/views/menu-view.tsx`

## Design Decision
Use external URLs instead of Convex storage because:
1. WhatsApp automatically previews public image URLs
2. Client already has images hosted externally
3. Simplifies implementation (no upload to WhatsApp Media API from storage)
4. More flexible for restaurants with existing image hosting

## Linear Issues
- LIG-5: Envío de Imágenes de Productos (parent)
- LIG-15: Schema + Dashboard changes
- LIG-16: AI Tool creation
- LIG-17: Graceful handling when no image
