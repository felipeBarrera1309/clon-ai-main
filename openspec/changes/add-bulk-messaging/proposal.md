# Change: Add Bulk Messaging System

**Linear Issue**: [LIG-7](https://linear.app/lighthouse-projects/issue/LIG-7/mensajeria-masiva) (Parent - DONE)
**Priority**: HIGH (2)
**Label**: Feature

## Sub-Issues

| Issue | Title | Status |
|-------|-------|--------|
| [LIG-22](https://linear.app/lighthouse-projects/issue/LIG-22) | Revisar implementación de Kevin para reutilizar | Done |
| [LIG-23](https://linear.app/lighthouse-projects/issue/LIG-23) | Diseñar UI para selección de destinatarios | Done |
| [LIG-24](https://linear.app/lighthouse-projects/issue/LIG-24) | Implementar envío masivo de mensajes | Done |
| [LIG-25](https://linear.app/lighthouse-projects/issue/LIG-25) | Crear sistema de campañas/avisos | **Backlog** (HIGH) |
| [LIG-26](https://linear.app/lighthouse-projects/issue/LIG-26) | Agregar filtros de segmentación de contactos | Done |

## Why

Restaurants need to send promotional messages, announcements, and reminders to multiple customers at once. This is a high-value differentiator as no other chatbot in the Colombian market offers this functionality. It enables marketing campaigns, special offers, and customer re-engagement.

**LIG-25 Remaining**: Need to add campaigns/announcements system with scheduling, templates management, and campaign history.

## What Changes

- ✅ Add bulk messaging module to dashboard
- ✅ Create message template management system
- ✅ Implement recipient selection with filters
- 🔲 Add scheduling capability for campaigns (LIG-25)
- 🔲 Create campaign history and analytics (LIG-25)
- ✅ Track delivery status and analytics
- ✅ Integrate with WhatsApp Business API for message sending

## Impact

- Affected specs: `bulk-messaging` capability
- Affected code:
  - `apps/web/modules/dashboard/bulk-messaging/` - Campaign management
  - `packages/backend/convex/` - Campaign scheduling, history
  - `packages/backend/convex/model/whatsapp.ts` - Bulk send functions

## Remaining Work (LIG-25)

The campaign system needs:
- Campaign scheduling with date/time picker
- Campaign templates library
- Campaign history view
- Campaign analytics (open rates, response rates)
- Campaign status tracking (draft, scheduled, sending, completed)
