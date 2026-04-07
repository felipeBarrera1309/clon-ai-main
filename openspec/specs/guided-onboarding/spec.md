# guided-onboarding Specification

## Purpose
TBD - created by archiving change add-guided-onboarding. Update Purpose after archive.
## Requirements
### Requirement: Onboarding Flow Management
The system SHALL provide a guided 5-step onboarding process for new organizations.

#### Scenario: New organization redirected to onboarding
- **WHEN** a user from a new organization logs in
- **AND** onboarding is not complete
- **THEN** they are redirected to the onboarding flow
- **AND** cannot access the main dashboard until completion

#### Scenario: Progress tracking
- **WHEN** user completes a step
- **THEN** progress is saved
- **AND** user can return later and continue from where they left off

#### Scenario: Step navigation
- **WHEN** user is in the onboarding flow
- **THEN** they can navigate back to previous steps
- **AND** they can skip optional steps
- **AND** progress indicator shows current position

### Requirement: Step 1 - Multi-Step Menu Import Wizard
The system SHALL provide a multi-step wizard within Step 1 that creates proper relational menu data (categories, subcategories, sizes, products) through LLM-powered document extraction or manual entry.

#### Scenario: Menu import sub-steps
- **WHEN** user is in Step 1 (Menu Import)
- **THEN** they see a 5 sub-step wizard:
  - Sub-step 1: Categories
  - Sub-step 2: Subcategories (optional)
  - Sub-step 3: Sizes (optional)
  - Sub-step 4: Products
  - Sub-step 5: Review & Import

#### Scenario: Extract categories from document
- **WHEN** user uploads a menu document (PDF, JPG, PNG)
- **AND** selects to extract categories
- **THEN** the document is processed using Gemini LLM
- **AND** extracted categories are displayed in an editable table
- **AND** user can add, edit, or delete categories

#### Scenario: Manual category entry
- **WHEN** user chooses to add categories manually
- **THEN** they can add new category rows
- **AND** category names must be unique within the organization

#### Scenario: Extract subcategories with context
- **WHEN** user uploads a document in Sub-step 2
- **THEN** the LLM receives the categories from Sub-step 1 as context
- **AND** extracts subcategories mapped to the correct categories
- **AND** user can edit the category assignment via dropdown

#### Scenario: Extract sizes from document
- **WHEN** user uploads a document in Sub-step 3
- **THEN** the LLM extracts size options (e.g., "Personal", "Grande")
- **AND** sizes are displayed in an editable table

#### Scenario: Extract products with full context
- **WHEN** user uploads a document in Sub-step 4
- **THEN** the LLM receives categories, subcategories, and sizes as context
- **AND** extracts products with proper assignments
- **AND** products table shows dropdowns for category, subcategory, and size

#### Scenario: Product table columns
- **WHEN** user views the products table
- **THEN** columns include: Name, Description, Category (dropdown), Subcategory (dropdown), Size (dropdown), Price
- **AND** subcategory dropdown is filtered by selected category

#### Scenario: Review before import
- **WHEN** user reaches Sub-step 5 (Review)
- **THEN** they see a summary: X categories, Y subcategories, Z sizes, N products
- **AND** they can expand lists to view all items
- **AND** they can go back to any sub-step to make changes

#### Scenario: Import menu data
- **WHEN** user clicks "Import Menu"
- **THEN** data is saved to database in correct order:
  1. `menuProductCategories`
  2. `menuProductSubcategories` (with category foreign keys)
  3. `sizes`
  4. `menuProducts` (with all foreign keys resolved)
- **AND** onboarding progress is updated
- **AND** user proceeds to Step 2

#### Scenario: Data persistence during wizard
- **WHEN** user navigates between sub-steps
- **THEN** all entered data is preserved in React state
- **AND** no database writes occur until final import
- **AND** data survives page refresh (via Jotai atomWithStorage)

#### Scenario: Skip menu import
- **WHEN** user clicks "Skip" in Step 1
- **THEN** no menu data is imported
- **AND** user proceeds to Step 2
- **AND** they can add menu items later in the dashboard

### Requirement: Step 2 - Restaurant Locations
The system SHALL allow defining one or more restaurant locations.

#### Scenario: Add restaurant location
- **WHEN** user adds a location
- **THEN** they enter: name, address, phone number
- **AND** they can select coordinates on a map
- **AND** they define operating hours per day

#### Scenario: Multiple locations
- **WHEN** restaurant has multiple locations
- **THEN** user can add additional locations
- **AND** each location has independent configuration

#### Scenario: Location schedule
- **WHEN** user configures location schedule
- **THEN** they set opening/closing hours per day
- **AND** they can mark days as closed
- **AND** they can set different hours for different days

### Requirement: Step 3 - Delivery Zones Configuration
The system SHALL allow configuring delivery zones with pricing.

#### Scenario: Select city with predefined zones
- **WHEN** user selects their city
- **THEN** predefined geocercas (zones) are displayed on the map
- **AND** zones are visually distinct

#### Scenario: Configure zone pricing
- **WHEN** user selects a zone
- **THEN** they enter: delivery price, estimated delivery time
- **AND** they can add conditions (minimum order, etc.)

#### Scenario: Group zones with same pricing
- **WHEN** multiple zones have the same price
- **THEN** user can select multiple zones
- **AND** apply the same pricing to all selected

#### Scenario: Assign zones to locations
- **WHEN** restaurant has multiple locations
- **THEN** user assigns which location serves each zone
- **AND** zones can be served by multiple locations

### Requirement: Step 4 - Bot Calibration
The system SHALL allow configuring AI bot behavior through a questionnaire.

#### Scenario: Tone configuration
- **WHEN** user answers tone questions
- **THEN** options include: formal, casual, friendly, professional
- **AND** selection affects how the bot communicates

#### Scenario: Greeting configuration
- **WHEN** user configures greeting
- **THEN** they can customize the welcome message
- **AND** they can include restaurant name and tagline

#### Scenario: Operating policies
- **WHEN** user configures policies
- **THEN** they set: minimum order amount, maximum delivery distance, order cutoff time
- **AND** these are enforced by the AI

#### Scenario: Response preferences
- **WHEN** user configures response style
- **THEN** they set: response length (brief/detailed), upselling behavior, promotion mentions

### Requirement: Step 5 - Business Rules
The system SHALL allow defining custom business rules via text or audio.

#### Scenario: Enter rules via text
- **WHEN** user types business rules
- **THEN** rules are saved as custom instructions
- **AND** examples are provided for guidance

#### Scenario: Enter rules via audio
- **WHEN** user records audio with business rules
- **THEN** audio is transcribed using speech-to-text
- **AND** transcription is displayed for review
- **AND** user can edit the transcription

#### Scenario: Rules examples
- **WHEN** user is entering rules
- **THEN** examples are shown: "Cambiar yuca por papa solo en combos", "No aceptar pedidos despues de las 10pm", "Ofrecer 10% descuento a clientes frecuentes"

### Requirement: System Prompt Generation
The system SHALL automatically generate the AI system prompt from onboarding data.

#### Scenario: Generate prompt from configuration
- **WHEN** onboarding is completed
- **THEN** a system prompt is generated combining: base instructions, tone settings, business rules, menu context
- **AND** the prompt is stored in agent configuration

#### Scenario: Prompt is editable post-onboarding
- **WHEN** user accesses prompt-builder in dashboard
- **THEN** they can view and edit the generated prompt
- **AND** changes are saved to agent configuration

### Requirement: Onboarding Completion
The system SHALL provide a completion summary and transition to dashboard.

#### Scenario: Completion summary
- **WHEN** user completes all steps
- **THEN** a summary screen shows what was configured
- **AND** includes: products count, locations count, zones count

#### Scenario: Transition to dashboard
- **WHEN** user clicks "Ir al dashboard"
- **THEN** onboarding is marked complete
- **AND** user is redirected to the main dashboard
- **AND** future logins go directly to dashboard

