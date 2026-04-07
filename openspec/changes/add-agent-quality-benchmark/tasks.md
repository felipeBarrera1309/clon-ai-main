## 1. Backend Core
- [x] 1.1 Agregar tablas y validadores de benchmark en schema.
- [x] 1.2 Definir contratos TypeScript para casos, scoring y recomendaciones.
- [x] 1.3 Implementar runner con sandbox de tools y judge híbrido.
- [x] 1.4 Implementar scoring final con regla de fallos críticos.
- [x] 1.5 Persistir resultados por caso y resumen por corrida.

## 2. Datasets y Suites
- [x] 2.1 Crear suite global base v1.
- [x] 2.2 Crear generador de overlay por organización usando configuración y debug signals.

## 3. Orquestación
- [x] 3.1 Implementar creación/ejecución de corrida por trigger.
- [x] 3.2 Implementar trigger en onboarding completado.
- [x] 3.3 Implementar trigger en cambios de prompt/configuración.
- [x] 3.4 Implementar job semanal para encolar corridas.

## 4. Superadmin APIs
- [x] 4.1 Crear `createRun`.
- [x] 4.2 Crear `getRun` y `listRuns`.
- [x] 4.3 Crear `getRunReport` y `exportRunJson`.
- [x] 4.4 Crear `listRecommendations` y `applyRecommendationPreview`.

## 5. UI Superadmin
- [x] 5.1 Crear vista de benchmark por organización.
- [x] 5.2 Agregar tabs Runs / Case Failures / Recommendations / Compare.
- [x] 5.3 Integrar ejecución manual y export JSON.
- [x] 5.4 Agregar acceso desde detalle de organización.

## 6. Validation
- [ ] 6.1 Ejecutar typecheck/lint y corregir errores.
- [ ] 6.2 Validar OpenSpec con `openspec validate add-agent-quality-benchmark --strict`.

