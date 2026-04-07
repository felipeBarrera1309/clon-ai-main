# Change: Add Agent System Prompt Audit Log

## Why
Organizations iteratively improve their AI agent prompts, but today there is no historical trail of prompt changes. Without before/after snapshots and actor metadata, it is difficult to correlate prompt changes with better or worse agent behavior.

## What Changes
- Add a dedicated audit log table for organization prompt changes.
- Capture full before/after snapshots for prompt text fields.
- Record actor metadata, source, action, changed fields, and timestamp.
- Instrument all prompt update/reset mutations across private and superadmin routes.
- Add paginated read queries for private and superadmin contexts.
- Skip audit event insertion when there is no effective prompt text change.

## Impact
- Affected specs: `ai-tools`
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/lib/promptAudit.ts`
  - `packages/backend/convex/private/agentConfiguration.ts`
  - `packages/backend/convex/superAdmin/agentConfiguration.ts`
  - `packages/backend/convex/private/promptBuilder.ts`
  - `packages/backend/convex/superAdmin/promptBuilder.ts`
  - `packages/backend/convex/private/agentPromptAuditLogs.ts`
  - `packages/backend/convex/superAdmin/agentPromptAuditLogs.ts`
