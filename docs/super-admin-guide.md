# Platform Admin Guide

## Overview

The Platform Admin Panel is a specialized interface accessible only to users with the `admin` role in Better Auth. This panel provides cross-organization management capabilities that are not available to regular organization administrators.

## Terminology

- **Platform Admin**: A user with `role="admin"` in Better Auth. Has access to all organizations and platform-wide settings.
- **Organization Admin**: A user with `owner` or `admin` role within a specific organization. Can manage that organization's settings.
- **Organization Member**: A regular user within an organization with limited permissions.

## Access Control

### Who Can Access

Only users who have `role="admin"` in their Better Auth user record can access the admin panel. The system automatically verifies this role on every request.

### How to Access

1. Log in with a user account that has the `admin` role
2. Navigate to `/admin` or click "Platform Admin" in the sidebar
3. The panel will automatically load if you have the correct permissions

### Security Features

- **Backend Authorization**: All platform admin queries and mutations verify user role server-side
- **Frontend Guards**: Admin routes automatically redirect unauthorized users to the home page
- **Route Protection**: The admin layout checks permissions before rendering any content

## Features

### 1. Organizations Dashboard

**Location**: `/admin`

View a comprehensive overview of all organizations in the system:

- Total number of organizations
- Aggregate statistics (conversations, contacts, orders)
- Quick access to individual organization details

### 2. Organization Details

**Location**: `/admin/organizations/[organizationId]`

View detailed information about a specific organization:

#### Overview Tab
- Organization ID
- Activity statistics
- WhatsApp configuration status

#### Agent Configuration Tab
- View current AI agent settings
- Quick access to edit agent configuration

#### WhatsApp Tab
- View WhatsApp Business API configuration
- Phone number and integration status
- Quick access to edit WhatsApp settings

#### Locations Tab
- List all restaurant locations
- View availability status
- Location codes and addresses

### 3. Agent Configuration Management

**Location**: `/admin/organizations/[organizationId]/agent`

Edit AI agent configuration for any organization:

#### Customizable Sections
- **AI Models**: Select models for support, menu, and validation agents
  - Gemini 2.5 Flash
  - Grok 4 Fast
  - OpenAI OSS 120B/20B
  - OpenAI o4-mini

- **Brand Voice**: Define tone and personality
- **Restaurant Context**: Business information and specialties
- **Custom Greeting**: Welcome messages
- **Business Rules**: Organization-specific policies
- **Special Instructions**: Additional custom guidelines

#### Actions
- Save changes to agent configuration
- Create configuration if none exists
- Modifications apply immediately to the organization's AI agent

### 4. WhatsApp Configuration Management

**Location**: `/admin/organizations/[organizationId]/whatsapp`

Manage WhatsApp Business API integration for any organization:

#### Configuration Fields
- **Phone Number** (required): Display phone number
- **Phone Number ID** (required): WhatsApp Business API phone number ID
- **Access Token** (required): WhatsApp Business API access token
- **Display Name** (optional): Friendly name for the configuration
- **Restaurant Location** (optional): Associate with specific location
- **Active Status**: Enable/disable the integration

#### Actions
- Create new WhatsApp configuration
- Update existing configuration
- Toggle activation status

## Backend Architecture

### Platform Admin Utilities

**File**: `packages/backend/convex/lib/superAdmin.ts`

Key functions:
- `requireSuperAdmin(ctx)`: Throws error if user is not a platform admin
- `superAdminQuery`: Custom query wrapper that requires platform admin access
- `superAdminMutation`: Custom mutation wrapper that requires platform admin access
- `superAdminAction`: Custom action wrapper that requires platform admin access

### Platform Admin Check

**File**: `packages/backend/convex/auth.ts`

```typescript
// Check if current user is a platform admin
export const isPlatformAdmin = query({
  args: {},
  returns: v.boolean(),
  async handler(ctx) {
    const user = await authComponent.getAuthUser(ctx)
    return user?.role === "admin"
  },
})
```

### Super Admin Queries

**Directory**: `packages/backend/convex/superAdmin/`

#### Organizations
- `listAllOrganizations`: Get all organizations with statistics
- `getOrganizationDetails`: Get detailed info for specific organization

#### Agent Configuration
- `getAgentConfiguration`: Get AI configuration for organization
- `updateAgentConfiguration`: Modify AI settings

#### WhatsApp Configuration
- `getWhatsappConfiguration`: Get WhatsApp settings for organization
- `updateWhatsappConfiguration`: Modify WhatsApp integration

### Usage in Backend Functions

```typescript
import { superAdminMutation, superAdminQuery } from "../lib/superAdmin"

export const myAdminQuery = superAdminQuery({
  args: { organizationId: v.string() },
  handler: async (ctx, args) => {
    // User is already verified as platform admin
    return await ctx.db
      .query("someTable")
      .withIndex("by_organization_id", (q) => 
        q.eq("organizationId", args.organizationId)
      )
      .collect()
  },
})
```

## Frontend Architecture

### Route Protection

All admin routes use a layout that checks permissions:

```typescript
// app/(dashboard)/admin/layout.tsx
import { usePlatformAdmin } from "@/hooks/use-platform-admin"

const isPlatformAdmin = usePlatformAdmin()

if (isPlatformAdmin === false) {
  router.push("/")
}
```

### Navigation Integration

The admin panel link appears in the sidebar only for platform admin users:

```typescript
// modules/dashboard/ui/components/dashboard-sidebar.tsx
const { isPlatformAdmin } = usePermissions()

{isPlatformAdmin && (
  <SidebarGroup>
    <SidebarGroupLabel>Platform Admin</SidebarGroupLabel>
    // Admin navigation items
  </SidebarGroup>
)}
```

### Frontend Hooks

**File**: `apps/web/hooks/use-platform-admin.ts`

```typescript
export const usePlatformAdmin = (): boolean | undefined => {
  const isPlatformAdmin = useQuery(api.auth.isPlatformAdmin)
  return isPlatformAdmin
}
```

**File**: `apps/web/hooks/use-permissions.ts`

Returns `isPlatformAdmin` as part of the permissions object, along with `allowedPages` and `role`.

## Best Practices

### For Platform Admins

1. **Review Before Saving**: Always verify changes before saving configurations
2. **Test Changes**: After modifying agent or WhatsApp settings, test the integration
3. **Document Changes**: Keep track of significant configuration changes
4. **Secure Credentials**: WhatsApp access tokens are sensitive - handle with care

### For Developers

1. **Always Verify Permissions**: Use `superAdminQuery`/`superAdminMutation` wrappers
2. **Organization Scoping**: Ensure queries/mutations specify `organizationId`
3. **Error Handling**: Provide clear error messages for permission failures
4. **Audit Trail**: Consider logging platform admin actions for accountability

## Future Enhancements

Potential features to add:

1. **User Impersonation**: Allow platform admins to view the system as another user
2. **Activity Logs**: Track all platform admin actions
3. **Bulk Operations**: Edit multiple organizations simultaneously
4. **Organization Creation**: Create new organizations from the admin panel
5. **Advanced Analytics**: Cross-organization reporting and insights
6. **Configuration Templates**: Reusable configuration presets

## Troubleshooting

### Cannot Access Admin Panel

**Issue**: Redirected to home page when accessing `/admin`

**Solutions**:
1. Verify your user has `role="admin"` in Better Auth
2. Check that you're logged in with the correct account
3. Ensure the backend has regenerated with the latest queries

### Changes Not Saving

**Issue**: Configuration updates don't persist

**Solutions**:
1. Check browser console for errors
2. Verify all required fields are filled
3. Ensure Convex backend is running
4. Check network tab for failed mutations

### Organization Not Appearing

**Issue**: Expected organization doesn't show in list

**Solutions**:
1. Verify organization has data in at least one table
2. Check that `organizationId` is consistent across tables
3. Try refreshing the page to reload data

## Support

For issues or questions about the platform admin panel:

1. Check this documentation first
2. Review the AGENTS.md file for architecture details
3. Examine the backend code in `packages/backend/convex/superAdmin/`
4. Contact the development team for assistance
