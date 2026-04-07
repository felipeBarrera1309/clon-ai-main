# Change: Refactor AI Prompt Architecture and Enforce Prompt Preview Parity

## Why
The current AI prompt assembly has duplicated behavioral rules across static and dynamic sections, and tool descriptions include flow orchestration that should live in protocol/constraints. Additionally, prompt previews can diverge from runtime assembly, increasing QA risk.

## What Changes
- Refactor core prompt architecture to reduce duplication and clarify responsibilities.
- Normalize tool descriptions to focus on tool purpose and return semantics.
- Keep dynamic protocol focused on configuration-dependent flow rules.
- Remove dead prompt-related code and commented imports.
- Align private and superadmin prompt preview generation with runtime prompt assembly.

## Impact
- Affected specs: `ai-tools`
- Affected code:
  - `packages/backend/convex/system/ai/constants.ts`
  - `packages/backend/convex/system/ai/conversationProtocols.ts`
  - `packages/backend/convex/system/ai/tools/*.ts`
  - `packages/backend/convex/system/ai/agents/supportAgent.ts`
  - `packages/backend/convex/private/promptBuilder.ts`
  - `packages/backend/convex/superAdmin/promptBuilder.ts`
