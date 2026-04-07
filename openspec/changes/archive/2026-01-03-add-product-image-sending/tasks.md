## 1. Schema & Backend (LIG-15)
- [x] 1.1 Update `menuProducts` table schema: replace `imageStorageId` with `imageUrl` field
- [x] 1.2 Update `create` mutation to accept `imageUrl` parameter
- [x] 1.3 Update `updateProduct` mutation to accept `imageUrl` parameter
- [x] 1.4 Update `list` query return type to include `imageUrl`
- [x] 1.5 Update `listByCategory` query return type to include `imageUrl`
- [x] 1.6 Create `searchByName` internal query for AI tool product lookup

## 2. Dashboard UI (LIG-15)
- [x] 2.1 Add `imageUrl` field to `menuProductBuilderFormSchema` with URL validation
- [x] 2.2 Add `imageUrl` input field to `MenuProductBuilderForm` component
- [x] 2.3 Add live image preview when valid URL is entered
- [x] 2.4 Update form default values and reset logic for `imageUrl`
- [x] 2.5 Add image indicator icon to product table view (with tooltip)
- [x] 2.6 Add image indicator icon to product card view

## 3. WhatsApp Integration (LIG-16)
- [x] 3.1 Create `sendWhatsAppImageByUrl` helper function in `model/whatsapp.ts`
- [x] 3.2 Implement MIME type detection from URL extension
- [x] 3.3 Integrate with existing `uploadMediaToWhatsApp` function
- [x] 3.4 Integrate with existing `sendWhatsAppImageMessage` function

## 4. AI Tool (LIG-16)
- [x] 4.1 Create `sendProductImageTool` in `system/ai/tools/sendProductImage.ts`
- [x] 4.2 Implement product search using `searchByName` internal query
- [x] 4.3 Implement image URL validation and sending logic
- [x] 4.4 Register tool in `supportAgent.ts` tools object
- [x] 4.5 Update `TOOLS_AND_CAPABILITIES` in system prompt constants
- [x] 4.6 Update `CONVERSATION_PROTOCOL` with tool usage instructions

## 5. Graceful Handling (LIG-17)
- [x] 5.1 Handle case when product is not found (return helpful message)
- [x] 5.2 Handle case when product has no image (offer description alternative)
- [x] 5.3 Return structured response with success status and message

## 6. Testing & Validation
- [x] 6.1 Verify schema changes compile without errors
- [x] 6.2 Verify dashboard form accepts and displays image URLs
- [x] 6.3 Verify linting passes on all modified files
- [x] 6.4 Verify TypeScript type checking passes
