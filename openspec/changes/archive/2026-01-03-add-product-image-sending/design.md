## Context
The restaurant management platform needs to support sending product images via WhatsApp when customers explicitly request them. This requires changes across the schema, dashboard, backend, and AI agent system.

### Constraints
- WhatsApp Business API requires images to be uploaded first, then sent via media ID
- External URLs must be publicly accessible HTTPS URLs
- Supported formats: JPEG, PNG (WhatsApp standard)
- Maximum size: 5MB per image
- Images should only be sent on explicit customer request, not automatically

### Stakeholders
- Restaurant admins (upload/manage product images via dashboard)
- Customers (request product images via WhatsApp)
- AI agent (decides when to send images based on conversation)

## Goals / Non-Goals

### Goals
- Allow restaurants to associate external image URLs with menu products
- Enable AI bot to send product images when customers explicitly request them
- Provide graceful fallback when products don't have images
- Show visual indicators in dashboard for products with images

### Non-Goals
- Automatic image sending during menu browsing (explicitly avoided)
- Image upload/storage within Convex (using external URLs instead)
- Image optimization or resizing (handled by external hosting)
- Bulk image import functionality

## Decisions

### Decision 1: External URLs vs Convex Storage
**Choice**: Use external image URLs (`imageUrl` field) instead of Convex storage (`imageStorageId`)

**Rationale**:
- WhatsApp can preview public URLs automatically
- Client already has images hosted externally
- Simpler implementation without storage management
- More flexible for restaurants with existing CDN/hosting

**Alternatives considered**:
- Convex storage with `imageStorageId`: Rejected due to added complexity and client's existing external images

### Decision 2: On-Demand Only
**Choice**: Images sent only when customer explicitly requests ("mándame foto", "cómo se ve")

**Rationale**:
- Avoids message spam during menu browsing
- Reduces WhatsApp API costs
- Better user experience (customer controls what they see)
- Aligns with client requirements

### Decision 3: Graceful Degradation
**Choice**: When product has no image, offer description as alternative

**Rationale**:
- Maintains conversation flow
- Provides value even without image
- No error messages shown to customer

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| External URL becomes unavailable | Dashboard shows preview, admin can verify before saving |
| Large images slow down WhatsApp | Document 5MB limit, rely on external hosting optimization |
| AI misinterprets image requests | Clear system prompt instructions with examples |
| URL validation bypass | Zod URL validation in form, but no server-side enforcement |

## Migration Plan

1. **Schema change**: Replace `imageStorageId` with `imageUrl` - safe because `imageStorageId` was not actively used
2. **No data migration needed**: Field was optional and unused
3. **Rollback**: Revert schema change and remove tool registration

## Open Questions
- None remaining (all resolved during implementation)
