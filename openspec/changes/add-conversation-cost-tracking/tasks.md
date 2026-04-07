## 1. Data Model

- [x] 1.1 Add a `conversationAiThreads` table to persist all AI threads associated with a conversation
- [x] 1.2 Add freshness and coverage metadata to `conversations` for admin visibility and historical tracking
- [x] 1.3 Add a backfill job table to track per-organization historical cost jobs
- [x] 1.4 Backfill the primary thread link for existing conversations

## 2. Backend Cost Aggregation

- [x] 2.1 Extract a shared cost-normalization helper from agent thread messages
- [x] 2.2 Implement a reusable internal cost refresh flow that aggregates all registered threads for a conversation
- [x] 2.3 Replace duplicated resolution-time cost calculation with the shared flow
- [x] 2.4 Trigger cost refresh after support-agent runs, including tool-only runs
- [x] 2.5 Register auxiliary threads created by menu-context and combination-validation tools
- [x] 2.6 Add platform-admin cost queries for organization overview and per-conversation breakdown
- [x] 2.7 Add a batched, per-organization historical backfill action flow with resumable job state

## 3. Admin UI

- [x] 3.1 Remove AI cost visibility from the organization dashboard conversation surfaces
- [x] 3.2 Show organization-level AI cost aggregates in platform admin
- [x] 3.3 Show per-conversation total cost and per-message breakdown in platform admin
- [x] 3.4 Indicate estimated historical coverage and backfill job state in admin
- [x] 3.5 Format AI cost values consistently and provide empty states for missing cost data

## 4. Validation

- [x] 4.1 Validate organization scoping and platform-admin access for cost queries
- [ ] 4.2 Manually verify a conversation with auxiliary threads reports the expected total in a live deployment
- [ ] 4.3 Run clean global lint/typecheck for affected packages once pre-existing repo errors are resolved
