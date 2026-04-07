# Change: Add CRM Chat Agent for Business Intelligence

## Why
Restaurant owners need an easy way to query their business data without navigating complex dashboards. A chat bubble interface allows them to ask questions in natural language (e.g., "¿Cuánto vendí ayer?", "¿Cuáles son mis productos más vendidos?") and get instant answers. This also serves as a support channel for platform usage questions.

## What Changes
- Add floating chat bubble component to dashboard
- Create AI agent for business intelligence queries
- Implement SQL query generation from natural language
- Add context filters (date range, location, data type)
- Support both data queries and platform support questions

## Impact
- Affected specs: New `crm-chat-agent` capability
- Affected code:
  - `apps/web/modules/dashboard/` - New chat bubble component
  - `packages/backend/convex/` - New AI agent and query tools
  - `packages/backend/convex/system/ai/` - Business intelligence agent
