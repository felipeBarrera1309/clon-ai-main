/**
 * Admin module types
 */

export type UserRole = "admin" | "user" | null

export type UserStatus = "active" | "banned"

export interface AdminUser {
  _id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
  banned?: boolean | null
  banReason?: string | null
  banExpires?: number | null
  createdAt: number
  updatedAt: number
}

export interface AdminUserWithOrganizations extends AdminUser {
  organizations: Array<{
    _id: string
    name: string
    slug: string
    role: string
    joinedAt: number
  }>
  sessions: Array<{
    _id: string
    createdAt: number
    expiresAt: number
    ipAddress?: string | null
    userAgent?: string | null
  }>
}

export interface AdminOrganization {
  _id: string
  name: string
  slug: string
  logo?: string | null
  createdAt: number
  memberCount: number
}

export interface OrganizationStats {
  organizationId: string
  agentConfigId?: string
  conversationsCount: number
  contactsCount: number
  ordersCount: number
  menuProductsCount: number
  locationsCount: number
  deliveryAreasCount: number
  whatsappConfigId?: string
}

export interface DebugOrganizationRow {
  organizationId: string
  organizationName?: string
  organizationSlug?: string
  organizationLogo?: string | null
  debugCount: number
  lastActivityAt: number
}

export interface DebugConversationRow {
  _id: string
  threadId: string
  organizationId: string
  contactDisplayName?: string
  reason: string
  addedBy: string
  addedAt: number
  lastUpdatedAt?: number
  conversationStatus?: "unresolved" | "escalated" | "resolved" | "unknown"
  contactPhone?: string
}

export interface DebugAgentThreadSummary {
  _id: string
  organizationId: string
  threadId: string
  lastMessageAt: number
}

export interface DebugNavigationContext {
  organizationId?: string
  organizationName?: string
  threadId?: string
  currentView: "global" | "org-list" | "conversation-detail" | "org-agent"
}

export type UserFilterStatus = "all" | "active" | "banned"
export type UserFilterRole = "all" | "admin" | "user"
