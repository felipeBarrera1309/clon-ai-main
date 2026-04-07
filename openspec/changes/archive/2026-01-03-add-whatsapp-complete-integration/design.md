## Context
The WhatsApp Business Cloud API provides several features that improve user experience but are not yet implemented in the platform. These features are standard in modern WhatsApp integrations.

### Current State
- Messages are sent and received via WhatsApp Cloud API
- No typing indicator shown while bot processes messages
- No read receipts (blue ticks) sent to customers
- Location messages from customers are not processed
- Bot cannot send location messages

### Constraints
- WhatsApp Cloud API v21.0 (current version used)
- Typing indicator auto-dismisses after 25 seconds
- Marking a message as read marks all previous messages as read
- Location messages require latitude/longitude coordinates

## Goals / Non-Goals

### Goals
- Show typing indicator immediately when message is received
- Mark messages as read after processing
- Receive and process location messages from customers
- Send restaurant location to customers on demand
- Improve address validation by accepting location coordinates

### Non-Goals
- Real-time location tracking
- Multiple location sharing in single message
- Reverse geocoding (converting coordinates to address) - may be added later
- Location-based restaurant selection (already handled by delivery areas)

## Decisions

### Decision 1: Typing Indicator Timing
**Choice**: Send typing indicator immediately when message is received, before any processing

**Rationale**:
- Provides immediate feedback to customer
- Reduces perceived wait time
- Standard UX pattern for chat applications

**Alternatives considered**:
- Send after initial processing: Rejected - delays feedback
- Send multiple times during long processing: Rejected - unnecessary complexity

### Decision 2: Read Receipt Timing
**Choice**: Mark message as read after successful processing (before sending response)

**Rationale**:
- Confirms message was received and understood
- Aligns with user expectations
- Marking as read also marks all previous messages as read (WhatsApp behavior)

### Decision 3: Location Message Handling
**Choice**: Extract coordinates and use for address validation, store as special message type

**Rationale**:
- Coordinates can be used directly for delivery area validation
- More accurate than text-based address parsing
- Preserves original location data for reference

### Decision 4: Send Location Tool
**Choice**: Create dedicated AI tool `sendRestaurantLocationTool` that sends restaurant location

**Rationale**:
- AI can decide when to send location based on conversation context
- Useful for pickup orders and "where are you?" questions
- Uses restaurant location coordinates from `restaurantLocations` table

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Typing indicator timeout (25s) | Bot should respond within 25s; if longer, indicator disappears naturally |
| Location accuracy | Use coordinates directly for validation, don't rely on address text |
| API rate limits | Typing/read receipts are lightweight calls, unlikely to hit limits |
| Missing coordinates in location | Validate location message has required fields before processing |

## Migration Plan

1. **No data migration needed**: All changes are additive
2. **Backward compatible**: Existing messages continue to work
3. **Rollback**: Remove new function calls if issues arise

## Open Questions
- Should we implement reverse geocoding to convert coordinates to human-readable address?
- Should typing indicator be sent for widget messages too? (Currently widget doesn't use WhatsApp API)
