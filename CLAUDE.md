# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Echo is an AI-powered restaurant management platform that combines intelligent conversation handling, order management, and customer service automation. It's built specifically for restaurants and food service businesses in Colombia, with full Spanish localization and Colombian peso currency support.

## Project Structure

This is a Turbo monorepo with the following structure:
- `apps/web` - Main dashboard Next.js application (port 3000) for restaurant administrators
- `apps/widget` - Customer-facing widget Next.js application (port 3001, uses Turbopack) for chat interactions
- `packages/backend` - Convex backend with AI agents, database schema, and API functions
- `packages/ui` - Shared shadcn/ui component library
- `packages/math` - Utility package for mathematical operations
- `packages/eslint-config` - Shared ESLint configuration
- `packages/typescript-config` - Shared TypeScript configurations

## Development Commands

### Root level commands (use Turbo):
- `pnpm dev` - Start all apps in development mode
- `pnpm build` - Build all apps and packages
- `pnpm lint` - Run linting across all packages
- `pnpm format` - Format code using Biome
- `pnpm check` - Check code quality with Biome
- `pnpm check:fix` - Auto-fix code quality issues with Biome
- `pnpm cvdp` - Quick deploy Convex backend from root (alias for `cd packages/backend && pnpm convex deploy`)

### App-specific commands:
- `cd apps/web && pnpm dev` - Run web app only (port 3000)
- `cd apps/widget && pnpm dev` - Run widget app only (port 3001, with Turbopack)
- `cd apps/web && pnpm build` - Build web app for production
- `cd apps/widget && pnpm build` - Build widget app for production
- `cd apps/web && pnpm typecheck` - Type check web app
- `cd apps/widget && pnpm typecheck` - Type check widget app
- `cd apps/web && pnpm lint` - Run linting for web app
- `cd apps/web && pnpm lint:fix` - Auto-fix linting issues in web app
- `cd apps/widget && pnpm lint` - Run linting for widget app
- `cd apps/widget && pnpm lint:fix` - Auto-fix linting issues in widget app

### Backend-specific commands:
- `cd packages/backend && pnpm dev` - Start Convex development server
- `cd packages/backend && pnpm setup` - Set up Convex deployment

### Adding shadcn/ui components:
```bash
pnpm dlx shadcn@latest add button -c apps/web
```
Components are shared via the `@workspace/ui` package.

## Tech Stack

### Frontend (Both Apps):
- Next.js 15 with App Router
- React 19
- TypeScript 5
- Tailwind CSS
- shadcn/ui components via `@workspace/ui`
- Jotai for state management
- React Hook Form with Zod validation
- Better Auth for authentication (web app only)
- Vapi AI integration (widget app)
- Sentry for error monitoring
- Leaflet for interactive maps (delivery areas)

### Backend:
- Convex for database and serverless functions
- Uses `@convex-dev/agent` for AI conversation handling
- OpenAI/Google AI SDK integration (supports GPT-4o-mini, Gemini, Grok, Claude, Llama variants)
- AWS Secrets Manager for secure credential storage
- Multi-channel messaging: WhatsApp Business API, Twilio, Dialog360, Gupshup
- `@convex-dev/better-auth` for authentication with organizations plugin
- Convex plugins: `agent`, `r2` (Cloudflare storage), `rag` (semantic search), `resend` (email), `aggregate` (computed views), `betterAuth`

### Key Architecture Patterns:
- Workspace packages imported as `@workspace/[package-name]`
- Module-based organization within apps (`modules/auth`, `modules/dashboard`, `modules/widget`)
- Atomic design with shared components in UI package
- Spanish localization throughout the application (Colombian market focus)
- Organization-scoped multi-tenancy for restaurant management

## AI Architecture

### Agent System:
- **Factory Pattern**: `createSupportAgent()` allows dynamic agent configuration per organization
- **Tool-Based Architecture**: Composable AI tools for business operations:
  - `getContactInfo` - Customer information and preferences retrieval
  - `saveCustomerName` - Customer profile management
  - `getMenu` - Menu retrieval with pricing/availability
  - `getRestaurantLocations` - Location information and availability
  - `validateAddress` - Geographic delivery zone validation
  - `confirmOrder` - Order summary confirmation
  - `makeOrder` - Order processing with tax calculations (19% IVA)
  - `scheduleOrder` - Scheduled order creation with time validation
  - `modifyScheduledOrder` - Scheduled order modifications
  - `cancelScheduledOrder` - Scheduled order cancellation
  - `askPaymentMethod` - Payment method confirmation
  - `escalateConversation` - Human handoff for complex issues
  - `resolveConversation` - Conversation completion tracking

### Conversation Flow:
- **Thread-based persistence** for multi-turn conversations
- **Status management**: unresolved → escalated → resolved
- **Context-aware responses** using organization-specific system prompts
- **WhatsApp integration** for seamless customer communication

## Database Schema (Convex)

### Core Tables:
- `agentConfiguration` - Organization-specific AI prompts and customizable sections
- `restaurantLocations` - Multi-location management with schedules and coordinates
- `conversations` - Conversation threads with status tracking
- `contacts` - Customer contact management and preferences
- `menuProductCategories` - Menu category management
- `sizes` - Product size definitions
- `menuProducts` - Restaurant menu items with categories, pricing, and availability
- `menuProductAvailability` - Location-specific product availability
- `orderItems` - Individual items within orders
- `orders` - Complete order lifecycle with scheduled orders support
- `deliveryAreas` - Geographic zones with polygon coordinates
- `messageAttachments` - Media files associated with conversations
- `schedulingConfiguration` - Scheduled order settings (min/max times)
- `whatsappConfigurations` - WhatsApp Business API configurations

### Key Relationships:
- Organizations scope all data for multi-tenancy
- Restaurant locations manage delivery areas and product availability
- Orders reference restaurant locations and support scheduled activation
- Menu products have categories, sizes, and location-specific availability
- Conversations link to contacts and orders with status progression
- AI agents use organization-specific configurations with customizable prompts

## Business Logic Patterns

### Order Management:
- **Status Flow**: programado → pendiente → preparando → listo_para_recoger → en_camino → entregado → cancelado
- **Scheduled Orders**: Automatic activation at specified times with restaurant validation
- **Tax Calculation**: Automatic 19% IVA for Colombian market
- **Address Validation**: Polygon intersection with delivery areas
- **Multi-location Support**: Orders assigned to specific restaurant locations
- **Real-time Updates**: Live status tracking across all interfaces

### Menu System:
- **Categories**: pizzas_clasicas, pizzas_especiales, entrantes, bebidas
- **Dynamic Availability**: Real-time product availability by location
- **Pricing**: Colombian peso formatting with tax calculations
- **Ingredients/Allergens**: Comprehensive product information
- **Multi-location Support**: Location-specific product availability

### Scheduled Orders:
- **Time Validation**: 30-minute minimum, 7-day maximum advance
- **Restaurant Validation**: Automatic check of operating hours
- **Automatic Activation**: Scheduled activation using Convex scheduler
- **Modification Support**: Change time, items, or delivery details
- **Cancellation**: Cancel with automatic cleanup of scheduled tasks

### Restaurant Locations Management:
- **Multi-location Support**: Multiple restaurant locations per organization
- **Flexible Scheduling**: Custom operating hours per day/week
- **Geographic Management**: Coordinate-based location tracking
- **Availability Control**: Dynamic location activation/deactivation
- **Unique Identification**: Code-based location management

### Menu Combination Validation:
- **Standalone Products**: Non-standalone products (`standAlone: false`) cannot be ordered alone and require combination with standalone products
- **Half Pizza Rules**: Products marked as `combinableHalf: true` must be paired exactly with another half-combinable product of the same category and size
- **Combination Logic**: Each order item consists of multiple menuProducts that form valid combinations according to business rules
- **Validation Flow**: All combinations must pass `validateMenuCombinationsTool` before order confirmation

## Development Guidelines

### AI Tool Development:
- All tools must operate within organization scope
- Tools should be pure functions that interact with business entities
- Use thread-based context for conversation continuity
- Follow the existing tool pattern for consistency

### Database Operations:
- Always filter by `organizationId` for data isolation
- Use proper indexes for organization-scoped queries
- Follow existing schema patterns for new tables

### Frontend Patterns:
- Use Jotai atoms for cross-component state management
- Follow module-based organization (`modules/dashboard`, etc.)
- Implement proper loading states and error handling
- Use React Hook Form + Zod for all forms

## Colombian Localization

### Currency & Tax:
- Colombian Peso (COP) formatting: `$1.000` format
- 19% IVA (Colombian VAT) automatic calculation
- Colombian address formats and validation

### Language:
- Complete Spanish interface
- Restaurant-specific terminology
- Colombian Spanish colloquialisms in AI responses

## Environment Requirements

- Node.js >= 20
- pnpm@10.30.1 (pinned via `packageManager` in root `package.json`)
- Convex deployment for backend
- Better Auth secret for authentication
- OpenAI/Google AI API keys for AI functionality
- AWS credentials for secrets management (production)

## Environment Configuration

This project uses `@t3-oss/env-nextjs` and `@t3-oss/env-core` for strict environment variable validation.

### Setup Files:
- `apps/web/lib/env.ts` - Web app environment validation
- `apps/widget/lib/env.ts` - Widget app environment validation
- `packages/backend/convex/lib/env.ts` - Backend environment validation

### Environment Variables:

#### Web App (`apps/web`):
```bash
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-convex-deployment.convex.site  # For Better Auth
NEXT_PUBLIC_SITE_URL=https://admin.clonai.co                            # For Better Auth
```

#### Widget App (`apps/widget`):
```bash
NEXT_PUBLIC_BACKEND_WEBHOOK_URL=https://your-convex-deployment.convex.site/whatsapp/incoming
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
```

#### Backend (`packages/backend`):
```bash
WHATSAPP_VERIFY_TOKEN=your_whatsapp_verify_token
WHATSAPP_API_VERSION=v22.0
R2_PUBLIC_URL=https://your-r2-bucket.r2.dev
RESEND_API_KEY=re_your_resend_api_key
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
SITE_URL=https://admin.clonai.co
BETTER_AUTH_SECRET=your_better_auth_secret
OPENAI_API_KEY=sk_your_openai_api_key  # optional - can use other providers
```

## Code Quality & Formatting

### Biome Configuration
This project uses Biome (not Prettier/ESLint) for code formatting and linting:
- Configuration is in `biome.json` at the root level
- Run `pnpm format` to format all code
- Run `pnpm check` to check code quality issues
- Run `pnpm check:fix` to auto-fix code quality issues

#### Key Biome Rules

- **Sorting**: Tailwind classes are sorted automatically (`useSortedClasses` - error level with safe fix)
- **Backend Overrides** (`packages/backend/**`): Non-null assertions allowed (`noNonNullAssertion: off`)
- **Frontend Strict** (`apps/**`): React dependency arrays are strictly enforced (`useExhaustiveDependencies: error`)
- **Code Style**: Double quotes, 2-space indentation, 80-character line width
- **Import Style**: Node.js import protocol enforced, import types preferred (`useImportType`, `useNodejsImportProtocol`)
- **Performance**: `delete` operator is an error (use Map/Set instead)
- **Globals**: React and JSX available globally without imports

### Testing & Quality Assurance

This project currently does not have a formal test suite configured. When adding tests:

- No specific testing framework is currently set up
- Check with the team for preferred testing approach before implementing
- Consider the existing TypeScript setup when choosing testing tools

## Important Architectural Notes

### Module Organization Pattern

- Apps follow a consistent module structure: `modules/[domain]/ui/{components,layouts,views}`
- Web app modules: `auth`, `dashboard` with comprehensive UI organization
- Widget app modules: `widget` with screen-based organization for chat interface
- Atoms (Jotai state) are organized at module level (`modules/dashboard/atoms.ts`)

### Agent Factory Pattern

- `createSupportAgent()` in `packages/backend/convex/system/ai/agents/supportAgent.ts`
- Builds dynamic system prompts using `buildCompleteAgentSystemPrompt()` from constants
- Default model configurable per organization via `agentConfig.agentConfig?.supportAgentModel`; falls back to `openai-o4-mini` on the last retry attempt
- Agent tools are modular and located in `packages/backend/convex/system/ai/tools/`
- Several tools are **conditionally included** based on organization configuration (e.g., delivery validation, invoice data)
- Max 15 steps per conversation turn; stop signal and agent-initiated resolution also terminate the loop
- Additional specialized agents: `comboBuilderAgent`, `validationMenuAgent`, `menuQuestionAgent`, `debugAgent`

### Key AI Tools Available

- `getContactInfo.ts` - Customer data retrieval
- `saveCustomerName.ts` - Customer profile management
- `getMenu.ts` - Menu and product information
- `getRestaurantLocations.ts` - Location information and availability
- `validateMenuCombinations.ts` - Validate product combinations according to business rules (standalone products, half pizzas, etc.)
- `validateAddress.ts` - Delivery zone validation
- `confirmOrder.ts` - Order confirmation workflows (ONLY after validateMenuCombinations)
- `makeOrder.ts` - Order processing and creation (ONLY after confirmOrder)
- `scheduleOrder.ts` - Scheduled order creation (ONLY after confirmOrder)
- `modifyScheduledOrder.ts` - Scheduled order modifications
- `cancelScheduledOrder.ts` - Scheduled order cancellation
- `askPaymentMethod.ts` - Payment method confirmation
- `escalateConversation.ts` - Human handoff management
- `resolveConversation.ts` - Conversation completion

## Convex Development Guidelines

### Function Syntax and Patterns

This project follows strict Convex patterns as defined in `.cursor/rules/convex_rules.mdc`:

#### Function Definition

- ALWAYS use the new function syntax for Convex functions:

```typescript
import { query } from "./_generated/server";
import { v } from "convex/values";

export const exampleQuery = query({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    return "Hello " + args.name;
  },
});
```

#### Required Validators

- ALWAYS include argument and return validators for ALL Convex functions
- Use `returns: v.null()` if function doesn't return anything
- Use proper type validators: `v.id("tableName")`, `v.string()`, `v.number()`, etc.

#### Function Registration

- Use `query`, `mutation`, `action` for public functions
- Use `internalQuery`, `internalMutation`, `internalAction` for private functions
- Internal functions can only be called by other Convex functions

#### Function Calling

- Use `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` with proper FunctionReference
- Call internal functions using `internal.fileName.functionName`
- Call public functions using `api.fileName.functionName`

#### Database Queries

- DO NOT use `filter` in queries - define indexes and use `withIndex` instead
- Use `.unique()` for single document queries
- Use `.collect()` or `.take(n)` for multiple results
- Always order by creation time: `.order("desc")` or `.order("asc")`

#### Schema Design

- Define schema in `convex/schema.ts`
- Include all index fields in index names: `"by_field1_and_field2"`
- System fields `_id` and `_creationTime` are automatically added
- Use proper TypeScript types: `Id<"tableName">` for document IDs

### HTTP Endpoints

- HTTP endpoints are defined in `packages/backend/convex/http.ts`
- Use `httpAction` decorator from `./_generated/server` for all HTTP handlers
- Endpoints are registered at exact paths specified in the `path` field (e.g., `/api/someRoute`)
- Registered webhook routes: `/webhook` (WhatsApp), `/whatsapp/incoming` (widget), `/resend-webhook`, `/twilioPostWebhook`, `/dialog360Webhook`, `/gupshupWebhook`
- Better Auth routes registered dynamically at `/api/auth/**`
- Use `httpRouter()` from `convex/server` to create the router and export as default

### File Storage

- Convex includes built-in file storage for large files (images, videos, PDFs)
- Use `ctx.storage.getUrl()` to get signed URLs for files (returns `null` if file doesn't exist)
- Query the `_storage` system table for file metadata using `ctx.db.system.get(fileId)`
- NEVER use deprecated `ctx.storage.getMetadata()` - query `_storage` table instead
- External storage: Cloudflare R2 configured via `R2_PUBLIC_URL` environment variable
- Message attachments are stored with references in `messageAttachments` table
- All files must be converted to/from `Blob` objects when using Convex storage

### Scheduling and Cron Jobs

- **Cron Jobs**: Defined in `convex/crons.ts` using `cronJobs()` from `convex/server`
- Use `crons.interval` or `crons.cron` methods (NOT deprecated `crons.hourly`, `crons.daily`, `crons.weekly`)
- **Runtime Scheduling**: Use `ctx.scheduler.runAfter(delayMs, functionRef, args)` for delayed execution
- **Scheduled Orders**: Orders use automatic activation via Convex scheduler with cleanup support
- Always pass `FunctionReference` to scheduler methods (use `internal.fileName.functionName`)
- Cron functions should be internal actions for background processing
- Active cron: `process-scheduling-intents` runs every 15 seconds via `internal.system.schedulingIntents.processSchedulingIntents`

### Admin Team Access Control

- Special admin team user IDs configured for read-only access across all organizations
- Membership checks implemented at UI and API levels for privileged operations
- Admin users can view data from any organization without being a member
- Located in backend configuration for centralized management
- Used for platform support and monitoring purposes

### Aggregate System

Seven `@convex-dev/aggregate` instances provide organization-scoped computed views for orders, conversations, contacts, menu products, restaurant locations, and delivery areas. These are configured in `convex.config.ts` and used for efficient cross-organization dashboards. Always update aggregates alongside the underlying mutations.

### Data Migrations

Production migration utilities live in `packages/backend/convex/system/migrations/`. Key capability: `cloneOrganizationData.ts` copies an entire organization's configuration and menu (4000+ records) to another org idempotently while remapping foreign key IDs.

## Turbo Build System

This monorepo uses Turbo for task orchestration:

- **TUI Mode**: Interactive task running with `turbo dev`
- **Build Caching**: Outputs cached in `.next/**` and `dist/**` directories
- **Dev Tasks**: Run in persistent mode with no caching for hot reload
- **Task Dependencies**: Proper dependency chains ensure correct build order (`^build`, `^lint`)
- **Parallel Execution**: Independent tasks run concurrently for faster builds
