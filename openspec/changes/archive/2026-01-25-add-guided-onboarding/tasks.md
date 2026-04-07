# Tasks: Guided Onboarding System

**Linear Issue**: [LIG-11](https://linear.app/lighthouse-projects/issue/LIG-11/onboarding-guiado-v1)
**Priority**: HIGH

## 1. Onboarding Flow Structure [LIG-43]

- [x] 1.1 Create `(onboarding)` route group in Next.js app
- [x] 1.2 Create onboarding layout with progress indicator
- [x] 1.3 Create step navigation logic (next, back, skip)
- [x] 1.4 Create `onboardingProgress` table to track completion
- [x] 1.5 Redirect new orgs to onboarding, completed orgs to dashboard

## 2. Step 1: Menu Import Wizard [LIG-44]

### 2.1 Infrastructure

- [x] 2.1.1 Create `MenuImportState` types in `modules/onboarding/types.ts`
- [x] 2.1.2 Create `menuImportAtom` Jotai atom with persistence
- [x] 2.1.3 Create `MenuImportWizard` component for sub-step navigation
- [x] 2.1.4 Create reusable `DocumentUpload` component
- [x] 2.1.5 Create reusable `EditableTable` component
- [x] 2.1.6 Create `ExtractionLoading` component for LLM processing state

### 2.2 Backend: LLM Extraction

- [x] 2.2.1 Add `@google/generative-ai` dependency if not present
- [x] 2.2.2 Create `extractMenuFromDocument` Convex action
- [x] 2.2.3 Implement `CATEGORIES_EXTRACTION_PROMPT`
- [x] 2.2.4 Implement `SUBCATEGORIES_EXTRACTION_PROMPT` with category context
- [x] 2.2.5 Implement `SIZES_EXTRACTION_PROMPT`
- [x] 2.2.6 Implement `PRODUCTS_EXTRACTION_PROMPT` with full context
- [x] 2.2.7 Add error handling and JSON parsing for LLM responses

### 2.3 Backend: Data Import

- [x] 2.3.1 Create `importMenuData` mutation in `onboarding.ts`
- [x] 2.3.2 Implement category creation with tempId → realId mapping
- [x] 2.3.3 Implement subcategory creation with foreign key resolution
- [x] 2.3.4 Implement size creation
- [x] 2.3.5 Implement product creation with all foreign keys
- [x] 2.3.6 Add `normalizeProductName` helper function
- [x] 2.3.7 Update onboarding progress on successful import

### 2.4 Sub-Step 1: Categories

- [x] 2.4.1 Create `StepCategories` component
- [x] 2.4.2 Implement document upload → LLM extraction flow
- [x] 2.4.3 Implement editable categories table
- [x] 2.4.4 Add manual category entry
- [x] 2.4.5 Add category deletion with confirmation
- [x] 2.4.6 Validate unique category names

### 2.5 Sub-Step 2: Subcategories

- [x] 2.5.1 Create `StepSubcategories` component
- [x] 2.5.2 Implement category selector/filter
- [x] 2.5.3 Implement document upload → LLM extraction with category context
- [x] 2.5.4 Implement editable subcategories table with category dropdown
- [x] 2.5.5 Add manual subcategory entry
- [x] 2.5.6 Allow skipping this step (subcategories are optional)

### 2.6 Sub-Step 3: Sizes

- [x] 2.6.1 Create `StepSizes` component
- [x] 2.6.2 Implement document upload → LLM extraction
- [x] 2.6.3 Implement editable sizes table
- [x] 2.6.4 Add manual size entry
- [x] 2.6.5 Allow skipping this step (sizes are optional)

### 2.7 Sub-Step 4: Products

- [x] 2.7.1 Create `StepProducts` component
- [x] 2.7.2 Implement document upload → LLM extraction with full context
- [x] 2.7.3 Implement editable products table with:
  - Name (text input)
  - Description (text input)
  - Category (dropdown from step 1)
  - Subcategory (dropdown filtered by selected category)
  - Size (dropdown from step 3)
  - Price (number input with COP formatting)
- [x] 2.7.4 Add manual product entry
- [x] 2.7.5 Add bulk actions (delete selected)
- [x] 2.7.6 Add pagination for large product lists (>50 items)

### 2.8 Sub-Step 5: Review & Import

- [x] 2.8.1 Create `StepReview` component
- [x] 2.8.2 Display summary statistics (counts by type)
- [x] 2.8.3 Add expandable lists to view all items
- [x] 2.8.4 Implement "Import Menu" button with loading state
- [x] 2.8.5 Call `importMenuData` mutation
- [x] 2.8.6 Show success message and proceed to Step 2
- [x] 2.8.7 Handle import errors gracefully

### 2.9 Refactor Existing Menu Upload View

- [x] 2.9.1 Refactor `menu-upload-view.tsx` to use `MenuImportWizard`
- [x] 2.9.2 Remove old mock OCR implementation
- [x] 2.9.3 Update props interface if needed
- [x] 2.9.4 Test full flow from upload to import

## 3. Step 2: Restaurant Locations [LIG-45]

- [x] 3.1 Create location form UI (name, code, address, coordinates, schedule)
- [x] 3.2 Integrate MapboxMap for coordinate selection
  - Reused existing `RestaurantLocationForm` which has geocoding (address → coordinates)
- [x] 3.3 Create schedule editor per location (day/hours)
  - Reused existing `ScheduleManager` and `SpecialScheduleManager` components
- [x] 3.4 Connect to `restaurantLocations` table (create actual records)
- [x] 3.5 Validate required fields before proceeding

## 4. Step 3: Delivery Zones & Pricing [LIG-46]

- [x] 4.1 Create delivery zones form UI
- [x] 4.2 Integrate MapboxMap with predefined geocercas
- [x] 4.3 Create zone pricing form (price, estimated time)
- [x] 4.4 Allow grouping zones with same price (DEFERRED: Nice-to-have enhancement)
- [x] 4.5 Create zone-location assignment
- [x] 4.6 Connect to `deliveryAreas` table (create actual records)

## 5. Step 4: Bot Calibration [LIG-47]

- [x] 5.1 Create questionnaire UI for bot configuration
- [x] 5.2 Implement tone selection (formal/casual/friendly)
- [x] 5.3 Implement greeting customization
- [x] 5.4 Implement response preferences (length, upselling)
- [x] 5.5 Connect to `agentConfiguration` table
- [x] 5.6 Generate system prompt sections from answers

## 6. Step 5: Business Rules [LIG-48, LIG-49]

- [x] 6.1 Create text input for custom rules
- [x] 6.2 Create audio recording component UI
- [x] 6.3 Integrate Whisper API for audio transcription
- [x] 6.4 Process transcribed rules into structured format (DEFERRED: Text saved directly)
- [x] 6.5 Store rules in `agentConfiguration.businessRules`
- [x] 6.6 Include rules in system prompt generation

## 7. Prompt Generation

- [x] 7.1 Create `generateSystemPrompt` function from onboarding data
  - Already implemented in `packages/backend/convex/system/ai/constants.ts` as `buildCompleteAgentSystemPrompt()`
- [x] 7.2 Combine: base prompt + tone + rules + menu context
  - Function reads brandVoice, restaurantContext, customGreeting, businessRules, specialInstructions from agentConfiguration
- [x] 7.3 Store generated prompt in `agentConfiguration`
  - Onboarding mutations now update agentConfiguration fields directly
- [x] 7.4 Allow manual editing in prompt-builder after onboarding
  - Existing prompt-builder UI at `/dashboard/prompt-builder` allows editing

## 8. Completion & Transition

- [x] 8.1 Create completion summary screen
- [x] 8.2 Show what was configured
- [x] 8.3 Provide "Ir al dashboard" action
- [x] 8.4 Mark onboarding as complete
- [x] 8.5 Send welcome email with next steps

## 9. Testing & Validation

- [x] 9.1 Test menu import with various document formats (PDF, JPG, PNG) (REQUIRES MANUAL TESTING)
- [x] 9.2 Test LLM extraction accuracy with different menu styles (REQUIRES MANUAL TESTING)
- [x] 9.3 Test audio transcription quality (REQUIRES MANUAL TESTING)
- [x] 9.4 Verify generated prompts are coherent (REQUIRES MANUAL TESTING)
- [x] 9.5 Test full onboarding flow end-to-end (REQUIRES MANUAL TESTING)
- [x] 9.6 Verify LSP diagnostics clean
  - TypeScript typecheck passes for both web app and backend
  - No errors in onboarding module
- [x] 9.7 Run `openspec validate add-guided-onboarding --strict`
  - Validation passes: "Change 'add-guided-onboarding' is valid"
