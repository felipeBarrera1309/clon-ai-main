# Change: Add Voice Calls Module

## Why
Some customers prefer calling instead of texting. Adding a voice agent that can handle phone calls extends the platform's reach to customers who are less comfortable with WhatsApp messaging. This is a future enhancement after the core WhatsApp product is stable.

## What Changes
- Integrate with telephony service (Twilio, Vonage, or similar)
- Adapt existing WhatsApp conversation flow for voice interaction
- Implement speech-to-text and text-to-speech
- Register call history (duration, outcome, transcription)
- Add call management UI in dashboard

## Impact
- Affected specs: New `voice-calls` capability
- Affected code:
  - `packages/backend/convex/` - New tables for calls, telephony integration
  - `packages/backend/convex/system/ai/` - Voice-adapted agent
  - `apps/web/modules/dashboard/` - Call history and management UI

## Priority
**Low** - This feature is planned for after the core product is stable. Not immediate priority.

## Linear Issues
- LIG-13: Módulo de Llamadas (parent)
- LIG-53: Investigar integración con servicio de telefonía
- LIG-54: Adaptar flujo de WhatsApp a voz
- LIG-55: Registrar historial de llamadas
