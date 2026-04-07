## ADDED Requirements

### Requirement: Organization Agent Benchmark Runs
The system SHALL execute offline benchmark runs per organization using a global base suite plus an organization overlay suite.

#### Scenario: Manual run execution for an organization
- **WHEN** a platform admin triggers a benchmark run for an organization
- **THEN** the system creates a run with `trigger=manual`
- **AND** executes cases from the active global suite and active organization overlay suite
- **AND** persists run-level summary and case-level results

#### Scenario: Automatic run after prompt change
- **WHEN** the organization prompt/configuration is updated
- **THEN** the system enqueues a benchmark run with `trigger=prompt_change`
- **AND** executes the run asynchronously

#### Scenario: Automatic run after onboarding completion
- **WHEN** onboarding is marked as completed
- **THEN** the system enqueues a benchmark run with `trigger=onboarding`
- **AND** executes against generated overlay cases even without prior debug history

### Requirement: Hybrid Evaluation and Hard Pass Policy
The system SHALL evaluate each case using deterministic assertions and a semantic LLM judge, then apply a hard pass policy.

#### Scenario: Case scoring
- **WHEN** a benchmark case is executed
- **THEN** deterministic checks produce a deterministic score
- **AND** the judge model produces a semantic score and rationale
- **AND** the final case score is computed as `70% deterministic + 30% judge`

#### Scenario: Critical deterministic failure
- **WHEN** a critical deterministic assertion fails
- **THEN** the case is marked `criticalFailure=true`
- **AND** the case result is marked failed regardless of high semantic score

#### Scenario: Run pass decision
- **WHEN** all configured-profile case results are aggregated
- **THEN** the run passes only if `scoreGlobal >= 85`
- **AND** `criticalFailures == 0`

### Requirement: Reporting, Export and Recommendations
The system SHALL provide superadmin reporting APIs, JSON export, and non-destructive prompt recommendations.

#### Scenario: Report retrieval
- **WHEN** a superadmin requests a run report
- **THEN** the response includes run summary, per-case results and recommendations
- **AND** includes model-profile data for configured and baseline comparisons

#### Scenario: JSON export
- **WHEN** a superadmin exports a run
- **THEN** the system returns a JSON-serializable object containing run metadata, case results and recommendations

#### Scenario: Recommendation preview
- **WHEN** a superadmin requests recommendation preview
- **THEN** the system returns section, before/after suggestion and diff preview
- **AND** does not persist prompt changes automatically

