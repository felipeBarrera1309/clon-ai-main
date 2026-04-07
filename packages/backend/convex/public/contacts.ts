import { ConvexError, v } from "convex/values"
import { mutation } from "../_generated/server"
import { aggregateContactsByOrganization } from "../contactsAggregate"

export const getOrCreate = mutation({
  args: {
    contactPhoneNumber: v.string(),
    displayName: v.string(),
    businessPhoneNumber: v.string(),
  },
  handler: async (ctx, args) => {
    const whatsappConfiguration = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_phone_number", (q) =>
        q.eq("phoneNumber", args.businessPhoneNumber)
      )
      .unique()
    if (!whatsappConfiguration) {
      throw new ConvexError("Número de teléfono de negocio no encontrado")
    }

    // Check if contact already exists
    const existingContact = await ctx.db
      .query("contacts")
      .withIndex("by_organization_and_phone", (q) =>
        q
          .eq("organizationId", whatsappConfiguration.organizationId)
          .eq("phoneNumber", args.contactPhoneNumber)
      )
      .unique()

    if (existingContact) {
      return {
        contactId: existingContact._id,
        organizationId: whatsappConfiguration.organizationId,
      }
    }

    // Create new contact if doesn't exist
    const contact = await ctx.db.insert("contacts", {
      phoneNumber: args.contactPhoneNumber,
      displayName: args.displayName,
      organizationId: whatsappConfiguration.organizationId,
      lastMessageAt: Date.now(),
    })
    const createdContact = await ctx.db.get(contact)
    if (createdContact) {
      await aggregateContactsByOrganization.insertIfDoesNotExist(
        ctx,
        createdContact
      )
    }

    return {
      contactId: contact,
      organizationId: whatsappConfiguration.organizationId,
    }
  },
})
