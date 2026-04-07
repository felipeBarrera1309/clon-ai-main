# Change: Add Guided Onboarding System

**Linear Issue**: [LIG-11](https://linear.app/lighthouse-projects/issue/LIG-11/onboarding-guiado-v1)
**Priority**: HIGH (2)
**Label**: Feature

## Sub-Issues (All HIGH Priority)

| Issue | Title | Status |
|-------|-------|--------|
| [LIG-43](https://linear.app/lighthouse-projects/issue/LIG-43) | Diseñar interfaz de onboarding pre-dashboard | Backlog |
| [LIG-44](https://linear.app/lighthouse-projects/issue/LIG-44) | Paso 1: Subir menú (PDF/foto) con OCR y conversión a tabla | Backlog |
| [LIG-45](https://linear.app/lighthouse-projects/issue/LIG-45) | Paso 2: Definir sucursales | Backlog |
| [LIG-46](https://linear.app/lighthouse-projects/issue/LIG-46) | Paso 3: Configurar zonas de entrega con geocercas predefinidas | Backlog |
| [LIG-47](https://linear.app/lighthouse-projects/issue/LIG-47) | Paso 4: Calibrar comportamiento del bot (preguntas de configuración) | Backlog |
| [LIG-48](https://linear.app/lighthouse-projects/issue/LIG-48) | Paso 5: Reglas especiales del negocio (texto o audio transcrito) | Backlog |
| [LIG-49](https://linear.app/lighthouse-projects/issue/LIG-49) | Implementar transcripción de audios para reglas | Backlog |

## Why

This is the **star feature** for scaling the platform. Currently, onboarding new restaurants requires manual implementation work. A guided 5-step onboarding process will enable non-technical clients to set up their restaurant autonomously, reducing implementation time and enabling future SaaS self-service.

**Business Impact**: Critical for converting the product to SaaS model. Fastest path to customer acquisition without manual intervention.

## What Changes

- Create pre-dashboard onboarding interface for new organizations
- **Step 1**: Menu upload (PDF/image → OCR → editable table)
- **Step 2**: Define restaurant locations
- **Step 3**: Configure delivery zones with pricing (using predefined geocercas)
- **Step 4**: Calibrate AI bot behavior (tone, hours, responses)
- **Step 5**: Define business-specific rules (via text or audio transcription)
- Auto-generate AI system prompt from onboarding answers

## Impact

- Affected specs: New `guided-onboarding` capability
- Affected code:
  - `apps/web/app/(onboarding)/` - New onboarding routes
  - `apps/web/modules/onboarding/` - New onboarding module
  - `packages/backend/convex/` - OCR processing, prompt generation
  - `packages/backend/convex/system/ai/` - Prompt builder from config

## Acceptance Criteria (from LIG-11)

- [ ] Interfaz de onboarding pre-dashboard
- [ ] Los 5 pasos implementados y funcionando
- [ ] OCR para menús funcionando
- [ ] Transcripción de audios funcionando
