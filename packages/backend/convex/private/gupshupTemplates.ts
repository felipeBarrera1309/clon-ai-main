import { v } from "convex/values"
import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server"
import { authAction, authMutation, authQuery } from "../lib/helpers"
import {
  createGupshupTemplateV3,
  getGupshupTemplatesV3,
  getPartnerAppToken,
  setSubscriptionGupshup,
} from "../model/whatsapp"

/**
 * Get active Gupshup configuration for the organization
 */
async function getActiveGupshupConfig(ctx: any, organizationId: string) {
  const configs = await ctx.db
    .query("whatsappConfigurations")
    .withIndex("by_organization_provider_active", (q: any) =>
      q
        .eq("organizationId", organizationId)
        .eq("provider", "gupshup")
        .eq("isActive", true)
    )
    .first()

  if (!configs) {
    throw new Error(
      "No hay configuración de Gupshup activa para esta organización"
    )
  }

  return configs
}

/**
 * Synchronize Gupshup templates from the Partner API to the local database
 */
export const syncTemplates = authAction({
  args: {
    whatsappConfigId: v.optional(v.id("whatsappConfigurations")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthenticated")

    // Get config
    const config = args.whatsappConfigId
      ? await ctx.runQuery(internal.system.gupshup.getGupshupConfiguration, {
          id: args.whatsappConfigId,
        })
      : await ctx.runQuery(
          internal.private.gupshupTemplates.getActiveConfigInternal,
          { organizationId: identity.subject }
        )

    if (!config || !config.gupshupAppId || !config.gupshupAppToken) {
      throw new Error(
        "Configuración de Gupshup incompleta para Partner API v3 (falta appId o appToken)"
      )
    }

    const templates = await getGupshupTemplatesV3(
      ctx,
      config.gupshupAppId,
      config.gupshupAppToken
    )

    // Here we would save them to messageTemplates table
    // For now returning them
    return templates
  },
})

/**
 * Set the Gupshup webhook URL using the Partner API
 */
export const setupWebhook = authAction({
  args: {
    whatsappConfigId: v.id("whatsappConfigurations"),
    callbackUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.whatsappConfigId }
    )

    if (!config || !config.gupshupAppId || !config.gupshupAppToken) {
      throw new Error("Configuración de Gupshup incompleta para Partner API v3")
    }

    await setSubscriptionGupshup(
      ctx,
      config.gupshupAppId,
      config.gupshupAppToken,
      args.callbackUrl
    )

    return "Webhook configurado exitosamente"
  },
})

/**
 * Generate and Save App Token for a Gupshup app
 */
export const refreshAppToken = authAction({
  args: {
    whatsappConfigId: v.id("whatsappConfigurations"),
    partnerToken: v.string(), // This is the JWT from Partner Portal login
  },
  handler: async (ctx, args) => {
    const config = await ctx.runQuery(
      internal.system.gupshup.getGupshupConfiguration,
      { id: args.whatsappConfigId }
    )

    if (!config || !config.gupshupAppId) {
      throw new Error("Configuración de Gupshup no tiene appId")
    }

    const appToken = await getPartnerAppToken(
      ctx,
      config.gupshupAppId,
      args.partnerToken
    )

    await ctx.runMutation(
      internal.private.gupshupTemplates.saveAppTokenInternal,
      {
        id: args.whatsappConfigId,
        appToken: appToken,
      }
    )

    return "App Token refrescado y guardado exitosamente"
  },
})

export const getActiveConfigInternal = internalQuery({
  args: { organizationId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await getActiveGupshupConfig(ctx, args.organizationId)
  },
})

export const saveAppTokenInternal = internalMutation({
  args: { id: v.id("whatsappConfigurations"), appToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      gupshupAppToken: args.appToken,
      lastModified: Date.now(),
    })
  },
})
