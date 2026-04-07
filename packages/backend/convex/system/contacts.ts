import { v } from "convex/values"
import { internalMutation, internalQuery } from "../_generated/server"
import { aggregateContactsByOrganization } from "../contactsAggregate"

export const getOne = internalQuery({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.contactId)
  },
})

export const getOneByPhoneNumber = internalQuery({
  args: {
    phoneNumber: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_organization_and_phone", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .unique()
  },
})

export const getOrCreate = internalMutation({
  args: {
    phoneNumber: v.string(),
    displayName: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db
      .query("contacts")
      .withIndex("by_organization_and_phone", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .unique()
    if (contact !== null) {
      return contact
    }
    const contactId = await ctx.db.insert("contacts", {
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      organizationId: args.organizationId,
    })
    const createdContact = await ctx.db.get(contactId)
    if (createdContact) {
      await aggregateContactsByOrganization.insertIfDoesNotExist(
        ctx,
        createdContact
      )
    }
    return createdContact
  },
})

export const createOne = internalMutation({
  args: {
    phoneNumber: v.string(),
    displayName: v.string(),
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const contactId = await ctx.db.insert("contacts", {
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      organizationId: args.organizationId,
    })
    const createdContact = await ctx.db.get(contactId)
    if (createdContact) {
      await aggregateContactsByOrganization.insertIfDoesNotExist(
        ctx,
        createdContact
      )
    }
    return contactId
  },
})

export const updateLastKnownAddress = internalMutation({
  args: {
    contactId: v.id("contacts"),
    address: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.contactId, {
      lastKnownAddress: args.address,
    })
  },
})

export const updateDisplayName = internalMutation({
  args: {
    contactId: v.id("contacts"),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.contactId, {
      displayName: args.displayName,
    })
  },
})
