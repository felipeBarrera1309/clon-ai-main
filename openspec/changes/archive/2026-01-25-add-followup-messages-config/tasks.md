# Tasks: Add 100% Configurable Follow-up Messages System

**Linear Issue**: [LIG-166](https://linear.app/lighthouse-projects/issue/LIG-166/follow-ups-automaticos-100percent-configurables-por-cliente)
**Priority**: HIGH

## 1. Schema Changes

- [ ] 1.1 Add `followUpSequence` array field to `agentConfiguration` table
- [ ] 1.2 Define step schema: `{ order: number, delayMinutes: number, message: string }`
- [ ] 1.3 Add default sequence constant for new organizations
- [ ] 1.4 Create migration to add field with null default (preserves existing behavior)
- [ ] 1.5 Run Convex migration

## 2. Backend - Sequence Engine

- [ ] 2.1 Create `scheduleFollowUp` internal action
- [ ] 2.2 Implement message placeholder resolver (`{customerName}`, `{restaurantName}`)
- [ ] 2.3 Create `cancelPendingFollowUps` mutation for when customer responds
- [ ] 2.4 Implement sequence state tracking per conversation
- [ ] 2.5 Add `lastFollowUpIndex` to conversation state
- [ ] 2.6 Integrate with existing conversation inactivity detection

## 3. Backend - Conversation Integration

- [ ] 3.1 Update conversation timeout handler to use sequence
- [ ] 3.2 Ensure customer response cancels pending follow-ups
- [ ] 3.3 Reset sequence when new conversation starts
- [ ] 3.4 Log follow-up messages as system messages in conversation

## 4. Dashboard UI - Sequence Builder

- [ ] 4.1 Create `follow-up-sequence-builder.tsx` component
- [ ] 4.2 Implement add/edit/delete step functionality
- [ ] 4.3 Create delay input with minute picker (1-1440 range)
- [ ] 4.4 Create message textarea with character count
- [ ] 4.5 Add placeholder chips showing available variables
- [ ] 4.6 Implement drag-and-drop reordering (use `@dnd-kit`)

## 5. Dashboard UI - Preview & Save

- [ ] 5.1 Create timeline preview component
- [ ] 5.2 Show estimated send times based on delays
- [ ] 5.3 Implement "Reset to default" with confirmation dialog
- [ ] 5.4 Add save mutation with validation
- [ ] 5.5 Show success/error toasts

## 6. Integration with Customization Page

- [ ] 6.1 Add "Mensajes de Seguimiento" section to customization page
- [ ] 6.2 Position after voice/tone settings
- [ ] 6.3 Add explanatory header text
- [ ] 6.4 Link to sequence builder component

## 7. Testing & Validation

- [ ] 7.1 Test sequence execution with multiple steps
- [ ] 7.2 Test customer response cancels sequence
- [ ] 7.3 Test placeholder substitution
- [ ] 7.4 Test drag-and-drop reordering
- [ ] 7.5 Test reset to default
- [ ] 7.6 Verify LSP diagnostics clean
- [ ] 7.7 Run `openspec validate add-followup-messages-config --strict`
