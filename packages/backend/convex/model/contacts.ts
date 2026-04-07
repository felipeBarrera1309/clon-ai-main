import type { MutationCtx } from "../_generated/server"
import { aggregateContactsByOrganization } from "../contactsAggregate"
import { CreationFailedError } from "../lib/errors"

export const getOrCreateContact = async (
  ctx: MutationCtx,
  args: {
    phoneNumber: string
    displayName?: string
    organizationId: string
  }
) => {
  let contact = await ctx.db
    .query("contacts")
    .withIndex("by_organization_and_phone", (q) =>
      q
        .eq("organizationId", args.organizationId)
        .eq("phoneNumber", args.phoneNumber)
    )
    .unique()

  if (!contact) {
    const createdContact = await ctx.db.insert("contacts", {
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      organizationId: args.organizationId,
    })
    contact = await ctx.db.get(createdContact)
    if (contact) {
      await aggregateContactsByOrganization.insertIfDoesNotExist(ctx, contact)
    }
  } else {
    // If contact exists, check if we can improve the display name
    // Update if we have a real name (not just phone) and current name is empty or just phone
    if (
      args.displayName &&
      args.displayName !== args.phoneNumber &&
      (!contact.displayName ||
        contact.displayName === args.phoneNumber ||
        contact.displayName === contact.phoneNumber)
    ) {
      await ctx.db.patch(contact._id, { displayName: args.displayName })
      // Update local object to return correct data
      contact = { ...contact, displayName: args.displayName }
    }
  }
  if (!contact) {
    throw new CreationFailedError("No se pudo crear el contacto")
  }

  return contact
}
