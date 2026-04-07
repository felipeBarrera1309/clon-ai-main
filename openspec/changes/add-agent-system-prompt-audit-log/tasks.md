## 1. Schema and Shared Audit Utilities
- [x] 1.1 Add `agentPromptAuditLogs` table to Convex schema with source/action validators and required indexes.
- [x] 1.2 Create shared prompt snapshot + diff + insert utility in `lib/promptAudit.ts`.

## 2. Private Prompt Mutation Instrumentation
- [x] 2.1 Instrument `private/agentConfiguration.ts` prompt mutation/reset handlers to write audit logs.
- [x] 2.2 Instrument `private/promptBuilder.ts` core prompt update/reset handlers to write audit logs.

## 3. Superadmin Prompt Mutation Instrumentation
- [x] 3.1 Instrument `superAdmin/agentConfiguration.ts` prompt mutation/reset handlers to write audit logs.
- [x] 3.2 Instrument `superAdmin/promptBuilder.ts` core prompt update/reset handlers to write audit logs.

## 4. Read APIs
- [x] 4.1 Add `private.agentPromptAuditLogs.listByOrganization` paginated query.
- [x] 4.2 Add `superAdmin.agentPromptAuditLogs.listByOrganization` paginated query.

## 5. Validation
- [x] 5.1 Validate OpenSpec change with strict mode.
- [x] 5.2 Run backend typecheck and lint without introducing regressions.
