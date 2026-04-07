# Change: add-agent-quality-benchmark

## Why
La calidad del agente tiene variabilidad entre organizaciones y hoy no existe una evaluación cuantitativa repetible para detectar regresiones, validar prompts por cliente y mejorar onboarding sin historial.

## What Changes
- Añadir benchmark offline batch por organización con suite global + overlay organizacional.
- Implementar evaluación híbrida: reglas determinísticas + judge LLM.
- Registrar historial de corridas, resultados por caso, score agregado y recomendaciones de prompt.
- Exponer APIs superadmin para crear corridas, listar, reportar y exportar JSON.
- Disparar corridas automáticas en onboarding completado, cambios de prompt y job semanal.
- Agregar UI superadmin para Runs, Case Failures, Recommendations y compare configured vs baseline.

## Impact
- Affected specs: `agent-quality-benchmark` (new capability)
- Affected code:
  - `packages/backend/convex/schema.ts`
  - `packages/backend/convex/system/agentBenchmark*.ts`
  - `packages/backend/convex/superAdmin/agentBenchmark.ts`
  - `packages/backend/convex/private/*.ts` (hooks de trigger)
  - `apps/web/app/(dashboard)/admin/organizations/[organizationId]/benchmark/page.tsx`
  - `apps/web/modules/admin/ui/views/admin-agent-benchmark-view.tsx`

