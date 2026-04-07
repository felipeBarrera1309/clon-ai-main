# Change: Add 100% Configurable Follow-up Messages System

**Linear Issue**: [LIG-166](https://linear.app/lighthouse-projects/issue/LIG-166/follow-ups-automaticos-100percent-configurables-por-cliente)
**Priority**: HIGH (2)
**Label**: Improvement

## Why

Current follow-up messages have rigid timing (3-5-10 minutes). Each Clone AI client needs full control over:
- How many follow-up messages to send (1, 2, 3, 5... unlimited)
- When each message is sent (custom delay from last interaction)
- What each message says

This enables brand-customized conversation flows and better customer re-engagement.

## What Changes

- Replace fixed follow-up system with **dynamic sequence builder**
- Support N follow-up messages (client defines count)
- Each follow-up has:
  - ⏱ **Wait time** (minutes since last customer interaction)
  - ✍️ **Message content** (with placeholder support)
- Sequence only executes when customer remains inactive
- **BREAKING**: Existing hardcoded follow-up timing will be replaced

## Impact

- Affected specs: `ai-agent` (modified)
- Affected code:
  - `packages/backend/convex/schema.ts` - New `followUpSequence` array in agentConfiguration
  - `packages/backend/convex/ai/agent.ts` - Dynamic follow-up scheduling
  - `packages/backend/convex/ai/conversation.ts` - Sequence execution logic
  - `apps/web/modules/dashboard/customization/` - Sequence builder UI

## Configuration Example

A client could configure:
1. Follow-up 1: 2 min → "¿Sigues ahí? 😊"
2. Follow-up 2: 7 min → "Estoy listo para tomar tu pedido"
3. Follow-up 3: 15 min → "Si quieres te recomiendo los más vendidos"

Or another client: single message at 4 minutes, or 5 messages with varying delays.
