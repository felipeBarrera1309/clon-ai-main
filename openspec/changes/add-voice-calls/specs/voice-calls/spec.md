# Spec: Voice Calls

## Overview
Voice calling capability that allows the AI agent to handle phone calls from customers, using the same conversation logic as WhatsApp but adapted for voice interaction.

## Data Model

### calls table
```typescript
calls: defineTable({
  organizationId: v.string(),
  contactId: v.optional(v.id("contacts")),
  phoneNumber: v.string(),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  status: v.union(
    v.literal("ringing"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed"),
    v.literal("no_answer")
  ),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  transcription: v.optional(v.string()),
  outcome: v.optional(v.string()), // e.g., "order_placed", "inquiry", "escalated"
  recordingUrl: v.optional(v.string()),
})
```

## API Integration
- Provider: TBD (Twilio recommended for Colombia support)
- Webhook for incoming calls
- Speech-to-text: Provider's native or OpenAI Whisper
- Text-to-speech: Provider's native or OpenAI TTS

## Voice Agent Adaptations
- Shorter, more conversational responses
- Handle interruptions gracefully
- Confirmation prompts for critical actions (orders)
- Fallback to human operator option

## Dashboard Features
- Call history list with filters
- Call detail view with transcription
- Call analytics (duration, outcomes)
