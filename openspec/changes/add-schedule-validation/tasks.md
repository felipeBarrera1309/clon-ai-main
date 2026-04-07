# Tasks: Add Schedule Validation by Location and Delivery Type

**Linear Issue**: [LIG-88](https://linear.app/lighthouse-projects/issue/LIG-88/validacion-de-horarios-por-sucursal-y-por-tipo-de-entrega-al-confirmar)

## 1. Schema Changes

- [ ] 1.1 Add `deliverySchedule` field to restaurantLocations table (array of day/time ranges)
- [ ] 1.2 Add `pickupSchedule` field to restaurantLocations table (array of day/time ranges)
- [ ] 1.3 Rename existing schedule to `generalSchedule` for clarity (if needed)
- [ ] 1.4 Run Convex migration to apply schema changes

## 2. Backend - Schedule Utilities

- [ ] 2.1 Create `isWithinSchedule(schedule, datetime)` utility function
- [ ] 2.2 Create `getNextAvailableTime(schedule, datetime)` utility function
- [ ] 2.3 Create `getScheduleForDeliveryType(location, type)` helper
- [ ] 2.4 Handle null/empty schedules (default to general hours)

## 3. Backend - AI Tools

- [ ] 3.1 Update `validateAddressTool` to check delivery schedule after zone match
- [ ] 3.2 Add schedule validation response types:
  - `LOCATION_CLOSED` - General hours closed
  - `DELIVERY_UNAVAILABLE` - Delivery closed, pickup available
  - `PICKUP_UNAVAILABLE` - Pickup closed, delivery available
  - `ALL_SERVICES_CLOSED` - Everything closed
- [ ] 3.3 Return alternative options in tool response
- [ ] 3.4 Update `getRestaurantLocationsTool` to include schedule availability
- [ ] 3.5 Integrate with `scheduleOrderTool` for next available slot suggestion

## 4. AI Agent Prompts

- [ ] 4.1 Add conversation flow for schedule conflicts
- [ ] 4.2 Add response templates for each unavailability scenario
- [ ] 4.3 Add logic to offer alternatives (switch type or schedule)

## 5. Dashboard UI - Location Schedules

- [ ] 5.1 Add delivery schedule configuration section to location form
- [ ] 5.2 Add pickup schedule configuration section to location form
- [ ] 5.3 Create reusable schedule editor component (day selector + time ranges)
- [ ] 5.4 Show schedule preview/summary in location card
- [ ] 5.5 Add validation for overlapping/conflicting schedules

## 6. Testing & Validation

- [ ] 6.1 Test delivery closed, pickup open scenario
- [ ] 6.2 Test pickup closed, delivery open scenario
- [ ] 6.3 Test all services closed scenario
- [ ] 6.4 Test empty schedule defaults to general hours
- [ ] 6.5 Test bot offers correct alternatives
- [ ] 6.6 Test scheduled order integration
- [ ] 6.7 Verify LSP diagnostics clean on all changed files
