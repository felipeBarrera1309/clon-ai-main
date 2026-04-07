# Echo - AI-Powered Restaurant Management Platform

Echo is a comprehensive restaurant management platform that combines intelligent conversation handling, order management, and customer service automation. Built specifically for restaurants and food service businesses, it provides both administrative tools and customer-facing AI interactions.

## 🏗️ Architecture

This is a Turbo monorepo with the following structure:

```
clon-ai/
├── apps/
│   ├── web/          # Main dashboard application (Next.js)
│   └── widget/       # Customer-facing chat widget (Next.js)
├── packages/
│   ├── backend/      # Convex backend with AI agents
│   ├── ui/           # Shared shadcn/ui component library
│   ├── math/         # Mathematical utilities
│   ├── eslint-config/     # Shared ESLint configuration
│   └── typescript-config/ # Shared TypeScript configurations
└── README.md
```

## 🚀 Key Features

### 🤖 AI-Powered Customer Service

- **Intelligent Chatbot**: Natural language processing for customer inquiries
- **WhatsApp Integration**: Seamless messaging through WhatsApp Business API
- **Voice AI**: Vapi AI integration for voice conversations
- **Multilingual Support**: Full Spanish localization with Colombian peso currency
- **Smart Order Processing**: AI can take orders, validate addresses, and process payments

### 📊 Restaurant Management Dashboard

- **Order Management**: Complete order lifecycle from placement to delivery
- **Menu Management**: Dynamic menu with categories, pricing, and availability
- **Customer Database**: Contact management with registration tracking
- **Conversation Tracking**: Monitor and manage customer interactions
- **Delivery Areas**: Geographic zone management with custom pricing
- **Analytics Dashboard**: Business metrics and performance insights

### 🛠️ Technical Features

- **Real-time Updates**: Live data synchronization across all interfaces
- **Responsive Design**: Mobile-first approach with adaptive layouts
- **Type Safety**: Full TypeScript implementation across the stack
- **Modern UI**: shadcn/ui components with dark/light theme support
- **Form Validation**: Zod schema validation with React Hook Form
- **Error Monitoring**: Sentry integration for production monitoring

## 🛠️ Tech Stack

### Frontend

- **Next.js 15** with App Router
- **React 19** with modern hooks and patterns
- **TypeScript 5** for type safety
- **Tailwind CSS** for styling
- **shadcn/ui** component library
- **Jotai** for state management
- **React Hook Form** with Zod validation
- **date-fns** for date manipulation
- **Leaflet** for interactive maps

### Backend

- **Convex** as the backend-as-a-service platform
- **Convex Agent Framework** for AI conversation handling
- **OpenAI/Google AI** integration for natural language processing
- **Clerk** for authentication and user management
- **Vapi AI** for voice conversation capabilities
- **AWS Secrets Manager** for secure credential storage

### Development Tools

- **Turbo** for monorepo management
- **pnpm** for package management
- **ESLint** and **Prettier** for code quality
- **Sentry** for error monitoring and performance tracking

## 📋 Prerequisites

- **Node.js** >= 20
- **pnpm** >= 8
- **Convex** account
- **Clerk** account (for authentication)
- **OpenAI** or **Google AI** API key
- **Vapi AI** account (optional, for voice features)

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd clon-ai
pnpm install
```

### 2. Environment Setup

Create the following environment files:

**`.env.local` (for apps/web):**

```env
# Convex
CONVEX_DEPLOYMENT=your-convex-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/

# Sentry (Optional)
SENTRY_DSN=your-sentry-dsn
```

**`.env.local` (for apps/widget):**

```env
# Convex
CONVEX_DEPLOYMENT=your-convex-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
```

**`.env` (for packages/backend):**

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

### 3. Backend Setup

```bash
cd packages/backend
pnpm dev  # This will set up your Convex deployment
```

### 4. Development

```bash
# Start all applications (from root)
pnpm dev

# Or start individual apps
cd apps/web && pnpm dev     # Dashboard (http://localhost:3000)
cd apps/widget && pnpm dev  # Widget (http://localhost:3001)
```

## 📖 Usage Guide

### For Restaurant Administrators

1. **Access Dashboard**: Navigate to `http://localhost:3000`
2. **Sign In**: Use Clerk authentication to access the admin panel
3. **Configure Menu**: Add products, set prices in Colombian pesos
4. **Set Up Delivery Areas**: Define geographic zones with custom pricing
5. **Monitor Orders**: Track order status and customer interactions
6. **Manage Contacts**: View customer database with registration dates

### For Customers

1. **Widget Integration**: Embed the chat widget on your website
2. **WhatsApp**: Interact via WhatsApp Business API
3. **Voice Calls**: Use Vapi AI integration for voice orders
4. **Natural Conversations**: AI understands menu requests and delivery inquiries

## 🏢 Business Features

### Order Management

- **Order Lifecycle**: Pending → Preparing → Ready → Delivered → Completed
- **Real-time Updates**: Live status tracking across all interfaces
- **Customer Communication**: Automated notifications and updates
- **Payment Processing**: Integrated payment handling with tax calculations (19% IVA for Colombia)

### Menu Management

- **Categories**: Pizzas Clásicas, Pizzas Especiales, Entrantes, Bebidas
- **Dynamic Pricing**: Colombian peso formatting with real-time updates
- **Availability Control**: Toggle product availability instantly
- **Ingredients & Allergens**: Detailed product information

### Analytics & Reporting

- **Revenue Tracking**: Monthly and total revenue metrics
- **Order Analytics**: Status distribution and performance metrics
- **Customer Insights**: Registration tracking and engagement data
- **Conversation Metrics**: AI interaction success rates

## 🤖 AI Capabilities

### Natural Language Processing

- **Menu Inquiries**: "¿Qué pizzas tienen?" → Shows complete menu
- **Address Validation**: "¿Entregan a [address]?" → Validates delivery zones
- **Order Processing**: "Quiero una Margherita grande" → Processes order
- **Customer Service**: General inquiries and business information

### Conversation Flow

1. **Greeting & Intent Recognition**
2. **Information Gathering** (menu, address, preferences)
3. **Order Validation** (availability, delivery zones)
4. **Order Processing** (customer details, payment)
5. **Confirmation & Tracking**

## 🚀 Deployment

### Production Build

```bash
# Build all packages
pnpm build

# Deploy Convex backend
cd packages/backend
pnpm convex deploy

# Deploy frontend applications
cd apps/web
pnpm build
# Deploy to your preferred hosting (Vercel, Netlify, etc.)

cd apps/widget
pnpm build
# Deploy widget for customer embedding
```

### Environment Variables

Ensure all production environment variables are properly configured:

- Update Convex URLs to production endpoints
- Configure Clerk for production domains
- Set up proper CORS policies
- Update Sentry DSN for production monitoring

## 🔧 Development Commands

### Root Level (Turbo)

```bash
pnpm dev          # Start all apps in development
pnpm build        # Build all packages and apps
pnpm lint         # Lint all packages
pnpm format       # Format code with Prettier
```

### Application Specific

```bash
# Web Dashboard
cd apps/web
pnpm dev          # Start development server (port 3000)
pnpm build        # Production build
pnpm typecheck    # TypeScript validation
pnpm lint:fix     # Auto-fix linting issues

# Customer Widget
cd apps/widget
pnpm dev          # Start with Turbopack (port 3001)
pnpm build        # Production build
pnpm typecheck    # TypeScript validation

# Backend
cd packages/backend
pnpm dev          # Start Convex development
pnpm setup        # Set up Convex deployment
```

### Adding UI Components

```bash
# Add shadcn/ui components to the web app
pnpm dlx shadcn@latest add button -c apps/web

# Components are automatically available in @workspace/ui
```

## 🌐 Localization

The entire application is localized for Colombian Spanish:

- **Currency**: Colombian Peso (COP) formatting
- **Tax Rates**: 19% IVA (Colombian VAT)
- **Date Formats**: DD/MM/YYYY Colombian standard
- **Language**: Complete Spanish translation
- **Time Zones**: Colombian time zone support

## 🔐 Security Features

- **Authentication**: Secure Clerk-based user management
- **Authorization**: Organization-based access control
- **Data Protection**: Encrypted sensitive information storage
- **Input Validation**: Comprehensive Zod schema validation
- **Error Monitoring**: Production error tracking with Sentry
- **Rate Limiting**: API protection against abuse

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Style

- Follow existing TypeScript/React patterns
- Use provided ESLint configuration
- Format code with Prettier before committing
- Write descriptive commit messages
- Include tests for new features

## 📄 License

This project is private and proprietary. All rights reserved.

## 🆘 Support

For questions, issues, or support:

1. **Check** the CLAUDE.md file for development guidance
2. **Review** existing GitHub issues
3. **Create** a new issue with detailed information
4. **Contact** the development team

---
