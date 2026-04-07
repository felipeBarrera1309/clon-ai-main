# Project Context

## Purpose
**Echo** is an AI-powered restaurant management platform designed specifically for restaurants and food service businesses in Colombia. It combines intelligent conversation handling, order management, and customer service automation through an integrated web dashboard and customer-facing WhatsApp widget.

### Core Features
- **AI-Powered Customer Service**: Automated order taking and customer support via WhatsApp
- **Multi-tenant Restaurant Management**: Organization-scoped data with customizable AI agents
- **Multi-location Restaurant Support**: Multiple restaurant locations with individual schedules and availability
- **Scheduled Orders System**: Advance order booking with automatic activation
- **Real-time Order Management**: Complete order lifecycle from creation to delivery
- **Interactive Menu Management**: Dynamic product catalog with location-specific availability
- **Delivery Area Management**: Geographic zones with polygon-based validation per location
- **WhatsApp Business API Integration**: Seamless customer communication

## Tech Stack

### Frontend (Both Web & Widget Apps)
- **Next.js 15** with App Router
- **React 19** with modern hooks and patterns
- **TypeScript 5** with strict configuration
- **Tailwind CSS** for styling
- **shadcn/ui** components via `@workspace/ui` package
- **Jotai** for state management (atoms pattern)
- **React Hook Form** with Zod validation
- **Leaflet** for interactive maps (delivery areas)
- **Vapi AI** integration (widget app)
- **Sentry** for error monitoring

### Backend
- **Convex** for database and serverless functions
- **@convex-dev/agent** for AI conversation handling
- **OpenAI GPT-4o-mini** as the primary LLM
- **Google AI SDK** as alternative LLM option
- **AWS Secrets Manager** for secure credential storage
- **WhatsApp Business API** for customer communication
- **Clerk** for authentication (web app only)

### Development & Quality
- **Turbo** for monorepo orchestration
- **Biome** for linting and formatting
- **pnpm** for package management

## Project Conventions

### Code Style
- Use TypeScript with strict mode enabled
- Use function components with arrow functions for React
- Destructure props in function parameters
- Use Jotai atoms for cross-component state
- Use React Hook Form with Zod validation for forms
- Follow kebab-case for file names (e.g., `dashboard-sidebar.tsx`)
- Use PascalCase for components and types
- Use camelCase for functions, hooks, and constants

### Architecture Patterns
- **Module-Based Organization**: `modules/[domain]/ui/{components,layouts,views}`
- **Organization Scoping**: All data filtered by `organizationId` for multi-tenancy
- **AI Agent Factory Pattern**: Dynamic agent creation with customizable prompts
- **RAG System**: Semantic search for menu products using vectorized database

### Monorepo Structure
```
├── apps/
│   ├── web/           # Restaurant admin dashboard
│   └── widget/        # Customer-facing chat widget
├── packages/
│   ├── backend/       # Convex backend (database + serverless)
│   ├── ui/            # Shared shadcn/ui component library
│   ├── math/          # Utility mathematical operations
│   ├── eslint-config/ # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configurations
```

### Testing Strategy
- Manual testing through UI interaction (primary method)
- TypeScript provides compile-time error catching
- Future: Unit tests, integration tests, E2E tests planned

### Git Workflow
- Feature branches with descriptive names
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, etc.
- PR-based workflow with code review

## Domain Context

### Restaurant Operations
- **Orders**: Status progression: programado → pendiente → preparando → listo_para_recoger → en_camino → entregado → cancelado
- **Tax Calculation**: Colombian IVA (19%) automatic calculation
- **Currency**: Colombian pesos with `$1.000` format
- **Language**: All UI and AI responses in Colombian Spanish

### AI Agent System
- Modular prompt system with core (protected) and customizable sections
- Tools for: customer management, menu search, order creation, address validation, conversation control
- Conversation flow: greeting → address validation → menu presentation → order confirmation → payment → order creation

## Important Constraints
- All data must be organization-scoped for multi-tenancy
- WhatsApp messages must be in plain text (no markdown)
- AI responses must be in Colombian Spanish
- Orders require address validation for delivery
- Products may have combination rules (standalone, half-combinable)

## External Dependencies
- **WhatsApp Business API**: Customer communication
- **Clerk**: Authentication and organization management
- **OpenAI API**: GPT-4o-mini for AI conversations
- **Convex**: Real-time database and serverless functions
- **AWS Secrets Manager**: Secure credential storage
