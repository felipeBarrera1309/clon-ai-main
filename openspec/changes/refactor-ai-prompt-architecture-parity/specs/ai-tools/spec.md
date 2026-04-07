## ADDED Requirements

### Requirement: Runtime-Prompt and Preview Parity
The system SHALL generate prompt previews using the same prompt assembly pipeline used by runtime agent execution.

#### Scenario: Private prompt preview matches runtime assembly
- **WHEN** an authorized user requests a prompt preview
- **THEN** the preview is produced through `buildCompleteAgentSystemPrompt`
- **AND** the section ordering and dynamic protocol inclusion match runtime support agent behavior

#### Scenario: Superadmin prompt preview matches runtime assembly
- **WHEN** a superadmin requests a prompt preview for an organization
- **THEN** the preview is produced through `buildCompleteAgentSystemPrompt`
- **AND** the resulting prompt structure matches runtime assembly semantics

### Requirement: Prompt Architecture Separation of Concerns
The system SHALL keep static identity/capability/constraint rules separate from dynamic, configuration-dependent conversation protocol rules.

#### Scenario: Dynamic protocol remains config-dependent
- **WHEN** payment methods, invoice settings, or order type configuration changes
- **THEN** only dynamic protocol content changes accordingly
- **AND** static identity/capability/constraint sections remain stable

#### Scenario: Tool descriptions avoid orchestration logic
- **WHEN** tool metadata is defined
- **THEN** tool descriptions describe purpose and output expectations
- **AND** orchestration and sequencing rules are defined in protocol/constraints, not tool descriptions
