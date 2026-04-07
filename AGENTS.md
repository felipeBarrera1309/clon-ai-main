<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# AGENTS.md - Comprehensive Development Guide

## Project Overview

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

## Architecture Overview

### System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Dashboard │    │     Convex       │    │  WhatsApp API   │
│   (Next.js)     │◄──►│   Backend       │◄──►│   Business      │
│                 │    │   (Serverless)   │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Restaurant     │    │   AI Agent       │    │   Customer      │
│  Admin Users    │    │   System         │    │   Conversations │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Data Flow

1. **Customer Interaction**: Customers interact via WhatsApp widget
2. **Message Processing**: Messages are processed through Convex webhooks
3. **AI Agent Processing**: Customizable AI agents handle conversations using specialized tools
4. **Business Logic**: Orders, menus, and customer data are managed through Convex mutations/queries
5. **Admin Interface**: Restaurant staff manage operations through the Next.js dashboard

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
- **Better Auth** for authentication (web app only)

### Development & Quality

- **Turbo** for monorepo orchestration
- **ESLint** with TypeScript and React rules
- **Prettier** for code formatting
- **pnpm** for package management
- **Turbo** for build orchestration

## Codebase Organization

### Monorepo Structure

```
├── apps/
│   ├── web/              # Restaurant admin dashboard
│   └── widget/           # Customer-facing chat widget
├── packages/
│   ├── backend/          # Convex backend (database + serverless)
│   ├── ui/               # Shared shadcn/ui component library
│   ├── math/             # Utility mathematical operations
│   ├── eslint-config/    # Shared ESLint configuration
│   └── typescript-config/# Shared TypeScript configurations
```

### Module-Based Organization

Both apps follow a consistent module structure:

```
modules/[domain]/
├── ui/
│   ├── components/       # Reusable UI components
│   ├── layouts/          # Page layouts and containers
│   └── views/            # Page-specific components
├── atoms.ts              # Jotai state atoms
├── constants.ts          # Configuration constants
└── types.ts              # TypeScript type definitions
```

### Key Modules

- **auth**: Authentication flows and guards
- **dashboard**: Main admin interface with comprehensive modules:
  - **contacts**: Customer contact management
  - **conversations**: Real-time conversation monitoring
  - **orders**: Order management and status tracking
  - **menu**: Product catalog and availability management
  - **menu-builder**: Advanced menu configuration
  - **delivery-areas**: Geographic zone management
  - **restaurant-locations**: Multi-location administration
  - **customization**: AI agent prompt customization
  - **prompt-builder**: Advanced AI configuration
  - **promotions**: Marketing and discount management
  - **settings**: System configuration
  - **whatsapp**: WhatsApp integration management
- **widget**: Customer chat interface and session management

## Frontend Architecture

### Component Patterns

- **Function Components** with arrow functions
- **Props Destructuring** in function parameters
- **Custom Hooks** for complex logic
- **Compound Components** for complex UI patterns
- **shadcn/ui** as the primary component library

### State Management (Jotai)

```typescript
// atoms.ts - Module-level state
export const statusFilterAtom = atomWithStorage<FilterType>("key", "default");

// Component usage
const [filter, setFilter] = useAtom(statusFilterAtom);
```

### Form Handling

```typescript
// Schema definition with Zod
const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
});

// Form implementation
const form = useForm<z.infer<typeof formSchema>>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: "", email: "" },
});
```

### Data Fetching

```typescript
// Convex queries with React hooks
const orders = useQuery(api.private.orders.list, { status: "pending" });
const updateOrder = useMutation(api.private.orders.updateStatus);
```

## Backend Architecture

### Convex Database Schema

The database follows organization-scoped multi-tenancy:

#### Core Tables

- **agentConfiguration**: Customizable AI agent settings per organization with modular prompts
- **restaurantLocations**: Multi-location management with schedules, coordinates, and availability
- **conversations**: Thread-based customer conversations with status tracking
- **contacts**: Customer contact information and preferences
- **menuProductCategories**: Menu category management
- **sizes**: Product size definitions for menu items
- **menuProducts**: Restaurant menu items with categories, pricing, and availability
- **menuProductAvailability**: Location-specific product availability management
- **orderItems**: Individual items within orders with pricing breakdown
- **orders**: Complete order lifecycle with scheduled orders and location assignment
- **deliveryAreas**: Geographic delivery zones with polygon coordinates per location
- **messageAttachments**: Media files associated with conversations (audio/image)
- **schedulingConfiguration**: Scheduled order settings (time limits, advance booking)
- **whatsappConfigurations**: WhatsApp Business API configurations per organization

#### Key Patterns

- **Organization Scoping**: All data filtered by `organizationId`
- **Indexing Strategy**: Optimized indexes for common query patterns
- **Status Management**: Consistent status enums across entities
- **Audit Trail**: Automatic timestamp tracking with `_creationTime`

### Serverless Functions

#### Query Functions

```typescript
export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const orgId = identity.orgId;

    // Organization-scoped data access
    return await ctx.db
      .query("orders")
      .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
      .collect();
  },
});
```

#### Mutation Functions

```typescript
export const create = mutation({
  args: {
    /* validation schema */
  },
  handler: async (ctx, args) => {
    // Authentication check
    // Business logic validation
    // Database operation
    // Return result
  },
});
```

## AI Agent System

### Agent Factory Pattern

```typescript
// Dynamic agent creation with customizable prompts
export const createSupportAgent = (systemPrompt?: string) => {
  return new Agent(components.agent, {
    name: "supportAgent",
    languageModel: openai.chat("gpt-4o-mini"),
    instructions: systemPrompt || buildSystemPrompt(),
  });
};
```

### System Prompt Architecture

The AI agent uses a modular prompt system with:

#### Core Sections (Protected)

- **Identity & Purpose**: Core AI assistant definition
- **Tools & Capabilities**: Available functions and their purposes
- **Conversation Flow**: Required interaction patterns
- **Critical Rules**: Non-negotiable guidelines

#### Customizable Sections

- **Brand Voice**: Tone and personality customization
- **Restaurant Context**: Business-specific information
- **Custom Greeting**: Welcome message customization
- **Business Rules**: Organization-specific policies
- **Special Instructions**: Additional custom guidelines

### AI Tools

The AI agent has access to specialized tools:

#### Customer Management

- **getContactInfoTool**: Retrieve customer information and preferences
- **saveCustomerNameTool**: Store customer name for future interactions

#### Menu & Ordering

**🔄 RAG SYSTEM UPDATE**: The menu search functionality has been upgraded from AI agents to a real Retrieval-Augmented Generation (RAG) system using semantic search in vectorized databases. This provides better performance, accuracy, and scalability compared to the legacy `menuAgentModel` approach.

- **searchMenuProductsTool**: NEW RAG SYSTEM - Intelligent menu search using semantic search in vectorized database (replaces legacy menuAgentModel)
- **getMenuTool**: Display complete menu with pricing and availability
- **getRestaurantLocationsTool**: Get location information and availability
- **validateMenuCombinationsTool**: Validate product combinations according to business rules (standalone products, half pizzas, etc.)
- **validateAddressTool**: Verify delivery address within service areas
- **confirmOrderTool**: Show order summary for customer confirmation (ONLY after validateMenuCombinationsTool)
- **makeOrderTool**: Create final order (ONLY after confirmOrderTool)
- **scheduleOrderTool**: Create scheduled orders with time validation (ONLY after confirmOrderTool)
- **modifyScheduledOrderTool**: Modify existing scheduled orders
- **cancelScheduledOrderTool**: Cancel scheduled orders
- **askPaymentMethodTool**: Confirm payment method selection

#### Conversation Management

- **escalateConversationTool**: Transfer to human operator
- **resolveConversationTool**: Close conversation

### Conversation Flow

1. **Initialization**: Always start with `getContactInfoTool`
2. **Address Validation**: Use `validateAddressTool` before any delivery order
3. **Location Selection**: Use `getRestaurantLocationsTool` for multi-location orders
4. **Menu Presentation**: Show menu using `searchMenuProductsTool` (RAG system) when requested
5. **Menu Combination Validation**: Use `validateMenuCombinationsTool` to verify product combinations follow business rules (standalone products, half pizzas, etc.)
6. **Order Confirmation**: Use `confirmOrderTool` ONLY after successful validation
7. **Payment Method**: Confirm payment method with `askPaymentMethodTool`
8. **Order Creation**: Use `makeOrderTool` for immediate orders or `scheduleOrderTool` for future orders (ONLY after confirmation)
9. **Escalation**: Use `escalateConversationTool` for complex issues

## Business Logic Patterns

### Order Management Flow

```typescript
// Status progression: programado → pendiente → preparando → listo_para_recoger → en_camino → entregado → cancelado
const ORDER_STATUSES = {
  programado: "Scheduled",
  pendiente: "Pending",
  preparando: "Preparing",
  listo_para_recoger: "Ready for Pickup",
  en_camino: "On the Way",
  entregado: "Delivered",
  cancelado: "Cancelled",
} as const;
```

### Tax Calculation

```typescript
// Colombian IVA (19%) automatic calculation
const TAX_RATE = 0.19;
const subtotal = items.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0,
);
const tax = Math.round(subtotal * TAX_RATE);
const total = subtotal + tax;
```

### Address Validation

- **Polygon-based**: Delivery areas defined as geographic polygons per location
- **Leaflet Integration**: Interactive map editor for zone management
- **Real-time Validation**: AI tool integration for address checking

### Scheduled Orders System

- **Advance Booking**: Orders can be scheduled up to 7 days in advance
- **Time Validation**: Minimum 30-minute advance booking requirement
- **Restaurant Validation**: Automatic verification of operating hours
- **Automatic Activation**: Scheduled orders activate automatically at specified time
- **Modification Support**: Change time, items, or details before activation
- **Cancellation**: Cancel with automatic cleanup of scheduled tasks

### Restaurant Locations Management

- **Multi-location Support**: Multiple restaurant locations per organization
- **Flexible Scheduling**: Custom operating hours per location and day
- **Geographic Management**: Coordinate-based location tracking
- **Availability Control**: Dynamic activation/deactivation of locations
- **Code-based Identification**: Unique codes for location management
- **Product Availability**: Location-specific menu item availability

### Menu Combination Validation

- **Standalone Products**: Non-standalone products (`standAlone: false`) cannot be ordered alone and require combination with standalone products
- **Half Pizza Rules**: Products marked as `combinableHalf: true` must be paired exactly with another half-combinable product of the same category and size
- **Combination Logic**: Each order item consists of multiple menuProducts that form valid combinations according to business rules
- **Validation Flow**: All combinations must pass `validateMenuCombinationsTool` before order confirmation

## Authentication & Authorization

### Better Auth Integration (Web App)

```typescript
// Organization-scoped authentication via @convex-dev/better-auth
const identity = await ctx.auth.getUserIdentity();
const orgId = identity.orgId; // Automatic organization scoping

// All database operations filtered by organization
const orders = await ctx.db
  .query("orders")
  .withIndex("by_organization_id", (q) => q.eq("organizationId", orgId))
  .collect();
```

**Key Features**:
- Uses `@convex-dev/better-auth` with Convex backend
- Organization plugin for multi-tenant support
- Admin plugin for user management
- Auth client via `better-auth/react`

### Widget Authentication

- **Phone Number Based**: WhatsApp session management
- **Session Storage**: Persistent sessions with Jotai atoms
- **Webhook Security**: Secure message processing through Convex webhooks

## Internationalization & Localization

### Colombian Spanish Localization

- **Currency**: `$1.000` format for Colombian pesos
- **Date/Time**: Spanish locale with Colombian conventions
- **Restaurant Terminology**: Local restaurant vocabulary
- **Address Formats**: Colombian address conventions

### AI Language Customization

- **System Prompts**: All AI responses in Spanish
- **Colombian Context**: Culturally appropriate responses
- **Local Business Rules**: Colombian tax and delivery conventions

## Error Handling Patterns

### Frontend Error Handling

```typescript
// React Error Boundaries
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log to Sentry
    Sentry.captureException(error, { contexts: { errorInfo } });
  }
}

// Form validation with React Hook Form + Zod
const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: {},
});

// Convex error handling
try {
  await updateOrder({ id, status });
} catch (error) {
  toast.error(handleConvexError(error));
  // Show user-friendly error message
}
```

### Backend Error Handling

```typescript
// Convex error throwing
throw new ConvexError({
  code: "UNAUTHORIZED",
  message: "No estás autorizado para ver esta orden",
});

// Try-catch in mutations
try {
  // Business logic
  return await ctx.db.insert("orders", orderData);
} catch (error) {
  toast.error(handleConvexError(error));
}
```

## Testing Approach

### Current State

- **No Test Suite**: Currently configured but planned for future implementation
- **Manual Testing**: Primary testing method through UI interaction
- **Type Safety**: TypeScript provides compile-time error catching

### Future Testing Strategy

- **Unit Tests**: Component and utility function testing
- **Integration Tests**: Convex function and AI tool testing
- **E2E Tests**: Critical user journey testing
- **AI Tool Testing**: Specialized testing for AI agent behaviors

## Development Commands

### Root Commands (Turbo)

- `pnpm build` - Build all apps and packages
- `pnpm dev` - Start all apps in development mode
- `pnpm lint` - Run linting across all packages
- `pnpm format` - Format code using Prettier

### App-Specific Commands

- `cd apps/web && pnpm dev` - Run web app (port 3000)
- `cd apps/web && pnpm build` - Build web app
- `cd apps/web && pnpm lint` - Lint web app
- `cd apps/web && pnpm lint:fix` - Auto-fix linting issues in web app
- `cd apps/web && pnpm typecheck` - Type check web app

- `cd apps/widget && pnpm dev` - Run widget app with Turbopack (port 3001)
- `cd apps/widget && pnpm build` - Build widget app
- `cd apps/widget && pnpm lint` - Lint widget app
- `cd apps/widget && pnpm lint:fix` - Auto-fix linting issues in widget app
- `cd apps/widget && pnpm typecheck` - Type check widget app

### Backend Commands

- `cd packages/backend && pnpm dev` - Start Convex development server
- `cd packages/backend && pnpm setup` - Set up Convex deployment

### Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

## Code Style Guidelines

### TypeScript Configuration

- **Target**: ES2022
- **Module**: NodeNext with moduleResolution
- **Strict mode**: Enabled with `noUncheckedIndexedAccess`
- **Declaration files**: Generated with source maps
- **Isolated modules**: Enabled for better compatibility

### Imports and Modules

- Use workspace imports: `@workspace/[package-name]`
- Group imports: React/\*, third-party libraries, then local imports
- Use absolute paths within apps (no relative imports like `../../../`)
- Import types explicitly: `import type { User } from './types'`

### Naming Conventions

- **Components**: PascalCase (e.g., `DashboardSidebar`, `ProductForm`)
- **Functions/Hooks**: camelCase (e.g., `usePathname`, `isActive`)
- **Files**: kebab-case for components (e.g., `dashboard-sidebar.tsx`)
- **Constants**: camelCase (e.g., `dashboardItems`)
- **Types**: PascalCase (e.g., `UserProfile`, `OrderStatus`)

### Code Structure

- **React Components**: Use function components with arrow functions
- **Props**: Destructure in function parameters
- **State**: Use Jotai atoms for cross-component state
- **Forms**: Use React Hook Form with Zod validation
- **Error Handling**: Use try/catch with proper error boundaries

### Module Organization

- Follow `modules/[domain]/ui/{components,layouts,views}` pattern
- Keep atoms (Jotai state) at module level: `modules/dashboard/atoms.ts`
- Separate business logic from UI components
- Use constants files for configuration: `modules/dashboard/constants.ts`

### Spanish Localization

- Use Spanish text for UI labels and messages
- Follow Colombian Spanish conventions
- Currency formatting: `$1.000` format for Colombian pesos
- Restaurant terminology: Use appropriate Colombian Spanish terms

### ESLint Rules

- Extends TypeScript recommended rules
- Uses Prettier for code formatting
- React hooks rules enabled
- Next.js specific rules for performance
- Turbo plugin for environment variable checking

## Best Practices

### Development Workflow

1. **Always run linting**: `pnpm lint` before committing
2. **Type checking**: Run `pnpm typecheck` to ensure TypeScript compliance
3. **Test manually**: Verify functionality through UI interaction
4. **Follow module patterns**: Maintain consistent code organization
5. **Use workspace imports**: Leverage monorepo package sharing

### Database Operations

- **Organization scoping**: Always filter by `organizationId`
- **Proper indexing**: Use optimized indexes for query patterns
- **Error handling**: Implement comprehensive error handling
- **Data validation**: Use Zod schemas for input validation

### AI Agent Development

- **Tool isolation**: Each tool should perform one specific function
- **Error handling**: Tools should handle errors gracefully
- **Context awareness**: Use conversation context appropriately
- **Performance**: Optimize tool execution for responsive AI interactions

### Security Considerations

- **Authentication**: Always verify user identity and organization access
- **Data isolation**: Ensure organization-scoped data access
- **Input validation**: Validate all user inputs and API payloads
- **Error messages**: Avoid exposing sensitive information in errors

### Performance Optimization

- **Query optimization**: Use appropriate indexes and filtering
- **Component lazy loading**: Implement code splitting where beneficial
- **Image optimization**: Use Next.js Image component for media
- **Bundle analysis**: Monitor bundle sizes and dependencies

This comprehensive guide should enable you to effectively develop new features while maintaining consistency with the existing codebase architecture and patterns.</content>
</xai:function_call/>
</xai:function_call name="run">
<parameter name="command">pnpm lint
