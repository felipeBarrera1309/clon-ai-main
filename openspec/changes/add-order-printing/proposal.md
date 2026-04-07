# Change: Add Order Printing System

## Why
Restaurants need to print order tickets (comandas) for kitchen preparation. Currently, staff must manually navigate to each order and print. This feature adds automatic printing when orders arrive and a batch printing interface for manual control.

## What Changes
- **Option 1 (Primary)**: Browser extension/bot that auto-detects new orders and triggers printing
- **Option 2 (Fallback)**: Pop-up notifications with print button for manual printing
- Add batch printing interface for multiple orders
- Create print-optimized order ticket layout

## Impact
- Affected specs: New `order-printing` capability
- Affected code:
  - `apps/web/modules/dashboard/` - Print UI components and notifications
  - `apps/web/` - Browser notification system
  - Potentially: Browser extension for auto-print
