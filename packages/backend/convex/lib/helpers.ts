import { ConvexError } from "convex/values"
import {
  customAction,
  customCtx,
  customMutation,
  customQuery,
} from "convex-helpers/server/customFunctions"
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server"
import { action, mutation, query } from "../_generated/server"
import { authComponent } from "../auth"
import { IdentityNotFoundError } from "./errors"

/**
 * Authentication utilities for consistent org validation across functions
 * Uses Better Auth for authentication
 */

export type AuthContext = QueryCtx | MutationCtx | ActionCtx

export type UserRole = "org:admin" | "org:member"

/**
 * Validates user authentication
 * @param ctx - Convex context
 * @returns Promise<AuthResult> - Validated user identity
 * @throws ConvexError if authentication fails
 *
 * NOTE: organizationId should be passed explicitly from the frontend.
 * The frontend gets activeOrganizationId from the Better Auth client session.
 */
export const validateAuth = async (ctx: AuthContext) => {
  let user: Awaited<ReturnType<typeof authComponent.getAuthUser>> | null = null
  try {
    user = await authComponent.getAuthUser(ctx)
  } catch (error) {
    // Better Auth throws when there's no valid session
    console.error("Auth error:", error)
    throw new IdentityNotFoundError()
  }

  if (user === null) {
    throw new IdentityNotFoundError()
  }

  // Create identity object for existing code
  const identity = {
    subject: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  }

  return { identity }
}

/**
 * Validates user authentication with explicit organization ID
 * Use this when organization context is passed from frontend
 * @param ctx - Convex context
 * @param organizationId - Organization ID from frontend
 * @returns Promise<AuthResult> - Validated identity and organization ID
 * @throws ConvexError if authentication fails
 */
export const validateAuthWithOrg = async (
  ctx: AuthContext,
  organizationId: string
) => {
  let user: Awaited<ReturnType<typeof authComponent.getAuthUser>> | null = null
  try {
    user = await authComponent.getAuthUser(ctx)
  } catch (error) {
    // Better Auth throws when there's no valid session
    console.error("Auth error:", error)
    throw new IdentityNotFoundError()
  }

  if (user === null) {
    throw new IdentityNotFoundError()
  }

  // Create identity object for existing code compatibility
  const identity = {
    subject: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  }

  return { identity, orgId: organizationId }
}

/**
 * Extracts user role from identity
 * @param identity - User identity
 * @returns UserRole - The user's organization role
 */
export const getUserRole = (identity: Record<string, unknown>): UserRole => {
  // For Better Auth, we'll use the role field from the user
  // This can be customized based on organization membership
  const role = identity.role
  if (role === "admin" || role === "org:admin") {
    return "org:admin"
  }
  return "org:member"
}

/**
 * Validates if user has admin role
 * @param identity - User identity
 * @throws ConvexError if user is not an admin
 */
export const requireAdminRole = (identity: Record<string, unknown>) => {
  const role = getUserRole(identity)
  if (role !== "org:admin") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message:
        "No tienes permisos para realizar esta acción. Se requiere rol de administrador.",
    })
  }
}

export const authQuery = customQuery(
  query,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    return { identity }
  })
)

export const authMutation = customMutation(
  mutation,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    return { identity }
  })
)

export const authAction = customAction(
  action,
  customCtx(async (ctx) => {
    const { identity } = await validateAuth(ctx)
    return { identity }
  })
)

/**
 * Date range utilities for dashboard metrics
 */
export interface DateRange {
  start: number
  end: number
}

export const getDateRange = (
  filter: string
): { current: DateRange; previous: DateRange } => {
  const now = new Date()
  let currentStartDate: Date
  let previousStartDate: Date
  let previousEndDate: Date

  switch (filter) {
    case "today":
      currentStartDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      )
      previousEndDate = new Date(currentStartDate.getTime() - 1)
      previousStartDate = new Date(
        previousEndDate.getFullYear(),
        previousEndDate.getMonth(),
        previousEndDate.getDate()
      )
      break
    case "lastWeek":
      currentStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      previousEndDate = new Date(currentStartDate.getTime() - 1)
      previousStartDate = new Date(
        previousEndDate.getTime() - 7 * 24 * 60 * 60 * 1000
      )
      break
    case "last15Days":
      currentStartDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
      previousEndDate = new Date(currentStartDate.getTime() - 1)
      previousStartDate = new Date(
        previousEndDate.getTime() - 15 * 24 * 60 * 60 * 1000
      )
      break
    case "lastMonth":
      currentStartDate = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        now.getDate() + 1
      )
      previousEndDate = new Date(currentStartDate.getTime() - 1)
      previousStartDate = new Date(
        previousEndDate.getFullYear(),
        previousEndDate.getMonth() - 1,
        previousEndDate.getDate() + 1
      )
      break
    default:
      currentStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      previousEndDate = new Date(currentStartDate.getTime() - 1)
      previousStartDate = new Date(
        previousEndDate.getTime() - 30 * 24 * 60 * 60 * 1000
      )
  }

  return {
    current: {
      start: currentStartDate.getTime(),
      end: now.getTime(),
    },
    previous: {
      start: previousStartDate.getTime(),
      end: previousEndDate.getTime(),
    },
  }
}

/**
 * Performance metrics calculation utilities
 */
export const calculatePercentageChange = (
  current: number,
  previous: number
): number => {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

/**
 * Order status validation utilities
 */
export type OrderStatus =
  | "programado"
  | "pendiente"
  | "preparando"
  | "listo_para_recoger"
  | "en_camino"
  | "entregado"
  | "cancelado"

export type OrderType = "delivery" | "pickup"

/**
 * Get allowed status transitions for a given order type
 * @param orderType - The type of order (delivery or pickup)
 * @returns Array of allowed statuses for that order type
 */
export const getAllowedStatusesForOrderType = (
  orderType: OrderType
): OrderStatus[] => {
  if (orderType === "pickup") {
    // For pickup orders, exclude "en_camino" status
    return [
      "programado",
      "pendiente",
      "preparando",
      "listo_para_recoger",
      "entregado",
      "cancelado",
    ]
  }

  // For delivery orders, include all statuses including "en_camino"
  return [
    "programado",
    "pendiente",
    "preparando",
    "listo_para_recoger",
    "en_camino",
    "entregado",
    "cancelado",
  ]
}

/**
 * Validate if a status transition is allowed for a given order type
 * @param currentStatus - The current status of the order
 * @param newStatus - The proposed new status
 * @param orderType - The type of order (delivery or pickup)
 * @returns boolean indicating if the transition is valid
 */
export const isValidStatusTransition = (
  currentStatus: OrderStatus,
  newStatus: OrderStatus,
  orderType: OrderType
): boolean => {
  // Check if new status is allowed for this order type
  const allowedStatuses = getAllowedStatusesForOrderType(orderType)
  if (!allowedStatuses.includes(newStatus)) {
    return false
  }

  // Additional business logic for status transitions
  const statusOrder: Record<OrderStatus, number> = {
    programado: 0,
    pendiente: 1,
    preparando: 2,
    listo_para_recoger: 3,
    en_camino: 4, // Only for delivery
    entregado: 5,
    cancelado: 6,
  }

  const currentOrder = statusOrder[currentStatus]
  const newOrder = statusOrder[newStatus]

  // Allow moving to any higher status (forward progression)
  if (newOrder > currentOrder) {
    return true
  }

  // Allow moving back to certain statuses (limited backward transitions)
  const allowedBackwardStatuses: OrderStatus[] = [
    "pendiente",
    "preparando",
    "listo_para_recoger",
  ]

  if (allowedBackwardStatuses.includes(newStatus) && newOrder < currentOrder) {
    // Only allow backward transitions to preparing or earlier
    return newOrder <= statusOrder.preparando
  }

  // Allow cancelling from any status
  if (newStatus === "cancelado") {
    return true
  }

  return false
}
