# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

Echo is an AI-powered restaurant management platform built specifically for Colombian restaurants. It combines intelligent conversation handling, order management, and customer service automation through a comprehensive web dashboard and customer-facing WhatsApp widget.

## Development Commands

### Essential Commands

```bash
# Start all applications in development mode
pnpm dev

# Build all packages and applications
pnpm build

# Lint all packages with auto-fix
pnpm lint

# Format code across the monorepo
pnpm format
```

### Application-Specific Development

```bash
# Web Dashboard (port 3000) - Restaurant admin interface
cd apps/web && pnpm dev
cd apps/web && pnpm build
cd apps/web && pnpm typecheck
cd apps/web && pnpm lint:fix

# Customer Widget (port 3001) - WhatsApp chat interface
cd apps/widget && pnpm dev  # Uses Turbopack for faster development
cd apps/widget && pnpm build
cd apps/widget && pnpm typecheck
cd apps/widget && pnpm lint:fix
```

### Backend Development

```bash
# Start Convex backend development server
cd packages/backend && pnpm dev

# Set up new Convex deployment
cd packages/backend && pnpm setup
```

### Component Library Management

```bash
# Add shadcn/ui components to web app
pnpm dlx shadcn@latest add button -c apps/web

# Components are automatically shared via @workspace/ui package
```

### Running Single Tests

This project currently does not have a formal test suite configured. Manual testing is performed through the UI interfaces and API endpoints.

## System Architecture

### High-Level Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │     Convex       │    │  WhatsApp API   │
│   (Next.js)     │◄──►│   Backend       │◄──►│   Business      │
│   Port 3000     │    │   (Serverless)   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Customer Chat  │    │   AI Agent       │    │   OpenAI/       │
│  Widget (3001)  │    │   System         │    │   Google AI     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Service Architecture

- **Monorepo Structure**: Turbo-managed workspace with independent deployable apps
- **Backend-as-a-Service**: Convex handles database, serverless functions, and real-time subscriptions
- **Multi-tenant**: Organization-scoped data isolation with Clerk authentication
- **Real-time Communication**: WebSocket connections via Convex for live updates
- **Event-driven**: WhatsApp webhooks trigger AI agent conversations

### Key Integration Points

- **Authentication**: Clerk handles organization-based access control (web app only)
- **State Management**: Jotai atoms for cross-component state sharing
- **Component Sharing**: `@workspace/ui` package provides shadcn/ui components
- **Type Safety**: Shared TypeScript configurations across all packages
- **API Layer**: Convex provides type-safe queries/mutations with real-time subscriptions

## AI Agent System

### Agent Architecture

The AI system uses a **Factory Pattern** with the `createSupportAgent()` function that allows dynamic configuration per organization:

```typescript
// Agent creation with customizable prompts
export const createSupportAgent = (systemPrompt?: string) => {
  return new Agent({
    name: "supportAgent",
    languageModel: openai.chat("gpt-4o-mini"),
    instructions: systemPrompt || buildSystemPrompt(),
  });
};
```

### AI Tool System

AI agents have access to specialized business tools:

#### Customer Management Tools
- `getContactInfoTool`: Retrieve customer data and preferences
- `saveCustomerNameTool`: Store customer information for future interactions

#### Menu & Ordering Tools  
- `getMenuTool`: Display complete menu with pricing and availability
- `validateAddressTool`: Verify delivery address within configured service areas
- `confirmOrderTool`: Show order summary for customer confirmation
- `makeOrderTool`: Create final order (only after explicit confirmation)

#### Conversation Management Tools
- `escalateConversationTool`: Transfer complex issues to human operators
- `resolveConversationTool`: Close completed conversations

### Conversation Flow Requirements

1. **Always Initialize**: Start with `getContactInfoTool` to identify customer
2. **Address Validation**: Use `validateAddressTool` before accepting any order
3. **Menu Presentation**: Show menu using `getMenuTool` when requested
4. **Order Confirmation**: Always use `confirmOrderTool` before `makeOrderTool`
5. **Human Handoff**: Use `escalateConversationTool` for complex issues

### System Prompt Architecture

- **Protected Core**: Identity, tools, conversation flow, and critical rules
- **Customizable Sections**: Brand voice, restaurant context, custom greetings, business rules
- **Organization-specific**: Each restaurant can customize AI behavior while maintaining core functionality

## Data Architecture

### Multi-tenant Data Model

All data is scoped by `organizationId` with the following core patterns:

```typescript
// Organization-scoped data access pattern
const identity = await ctx.auth.getUserIdentity();
const orgId = identity.orgId;

const orders = await ctx.db
  .query("orders")
  .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
  .collect();
```

### Core Business Entities

- **conversations**: Thread-based customer conversations with status tracking
- **contacts**: Customer contact management with WhatsApp integration
- **menuProducts**: Restaurant menu with categories, pricing, and availability
- **orders**: Complete order lifecycle with items, pricing, and status tracking
- **deliveryAreas**: Geographic zones defined as polygons for delivery validation
- **agentConfiguration**: Organization-specific AI agent customization
- **businessPhoneNumbers**: WhatsApp Business API phone number management

### Data Flow Patterns

- **Order Status Flow**: `pendiente → preparando → esperando_recogida → en_camino → entregado → cancelado`
- **Real-time Updates**: Convex subscriptions provide live data synchronization
- **Audit Trail**: All entities include automatic `_creationTime` timestamp tracking
- **Indexing Strategy**: Optimized indexes for organization-scoped queries

## Frontend Patterns

### State Management with Jotai

```typescript
// Module-level atoms for persistent state
export const statusFilterAtom = atomWithStorage<FilterType>("orders-status", "all");

// Component usage
const [filter, setFilter] = useAtom(statusFilterAtom);
```

### Component Organization

Apps follow a consistent module structure:
```
modules/[domain]/
├── ui/
│   ├── components/       # Reusable UI components
│   ├── layouts/          # Page layouts and containers
│   └── views/            # Page-specific components
├── atoms.ts              # Jotai state atoms
└── types.ts              # TypeScript type definitions
```

### Form Handling Pattern

```typescript
// Zod schema definition
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.number().positive("Price must be positive"),
});

// React Hook Form integration
const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: "", price: 0 },
});
```

### Data Fetching Pattern

```typescript
// Convex real-time queries
const orders = useQuery(api.private.orders.list, { status: "pending" });
const updateOrder = useMutation(api.private.orders.updateStatus);

// Handle loading state
if (orders === undefined) return <LoadingSpinner />;
```

### Error Handling

- **Error Boundaries**: React error boundaries with Sentry integration
- **Form Validation**: Zod schema validation with user-friendly error messages
- **API Errors**: Structured error handling with Convex error types
- **Toast Notifications**: User feedback via Sonner toast library

## Colombian Localization

### Currency & Tax System

```typescript
// Colombian peso formatting
const formatCurrency = (amount: number) => `$${amount.toLocaleString('es-CO')}`;

// 19% IVA (Colombian VAT) calculation
const TAX_RATE = 0.19;
const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
const tax = Math.round(subtotal * TAX_RATE);
const total = subtotal + tax;
```

### Address & Geography

- **Delivery Zones**: Polygon-based geographic validation using Leaflet maps
- **Colombian Address Format**: Standard Colombian addressing conventions
- **Real-time Validation**: AI tool integration for address verification

### Language & Culture

- **Full Spanish Interface**: Complete Spanish localization for both admin and customer interfaces
- **Colombian Spanish**: Culturally appropriate vocabulary and expressions
- **Restaurant Terminology**: Local Colombian restaurant business terms
- **Date/Time Formats**: Colombian standard formats (DD/MM/YYYY)

## Configuration & Environment

### Required Environment Variables

**Web App (`.env.local`):**
```env
# Convex Backend
CONVEX_DEPLOYMENT=your-convex-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Sentry (Optional)
SENTRY_DSN=your-sentry-dsn
```

**Widget App (`.env.local`):**
```env
# Convex Backend
CONVEX_DEPLOYMENT=your-convex-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

**Backend (`.env`):**
```env
# Convex
CONVEX_DEPLOYMENT=your-convex-deployment

# AI Providers
OPENAI_API_KEY=your-openai-key
# or
GOOGLE_AI_API_KEY=your-google-ai-key

# External Services
VAPI_PRIVATE_KEY=your-vapi-private-key
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
```

### Tech Stack Dependencies

- **Node.js**: >= 20
- **pnpm**: >= 8 (specified as `packageManager`)
- **Convex**: Backend-as-a-service platform
- **Clerk**: Authentication and user management (web app)
- **OpenAI/Google AI**: LLM providers for AI agent functionality
- **Vapi AI**: Voice conversation capabilities (optional)
- **AWS Secrets Manager**: Secure credential storage (production)

### Development Prerequisites

1. **Convex Setup**: Create Convex account and deployment
2. **Clerk Setup**: Configure organization-based authentication (web app only)  
3. **AI Provider**: OpenAI or Google AI API access
4. **WhatsApp Business**: For production customer communication
5. **AWS Account**: For secrets management in production

### Service Dependencies

- **Convex**: Database, serverless functions, real-time subscriptions
- **Clerk**: User authentication and organization management
- **WhatsApp Business API**: Customer communication channel
- **OpenAI/Google AI**: Natural language processing
- **Leaflet/OpenStreetMap**: Interactive mapping for delivery areas
- **Sentry**: Error monitoring and performance tracking

## Troubleshooting

### Common Development Issues

**Turbo Build Issues:**
```bash
# Clear Turbo cache
pnpm dlx turbo clean

# Rebuild all packages
pnpm build
```

**Convex Connection Issues:**
```bash
# Verify deployment configuration
cd packages/backend && npx convex dev --check

# Reset Convex deployment
cd packages/backend && pnpm setup
```

**Environment Variable Issues:**
- Ensure all required environment variables are set for each app
- Check that Convex URLs match between frontend and backend configurations
- Verify Clerk keys match between development and production environments

### Performance Optimization

- **Database Queries**: Always use indexed queries with organization scoping
- **Real-time Updates**: Use Convex subscriptions efficiently to avoid unnecessary re-renders
- **Bundle Optimization**: Monitor bundle sizes with Next.js analyzer
- **Image Optimization**: Use Next.js Image component for media assets

This documentation provides the essential architectural knowledge needed to be productive in this codebase while maintaining consistency with existing patterns.