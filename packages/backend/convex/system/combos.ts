import { v } from "convex/values"
import type { Id } from "../_generated/dataModel"
import { internalQuery } from "../_generated/server"

export const getAvailableCombosForLocation = internalQuery({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    const orgCombos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Get explicit availability records for this location.
    const availabilityRecords = await ctx.db
      .query("comboAvailability")
      .withIndex("by_restaurant_location_id", (q) =>
        q.eq("restaurantLocationId", args.restaurantLocationId)
      )
      .collect()

    const availabilityByCombo = new Map(
      availabilityRecords
        .filter((r) => r.organizationId === args.organizationId)
        .map((r) => [r.comboId, r.available])
    )

    const availableComboIds = orgCombos
      .filter((combo) => {
        if (!combo.isActive || combo.isDeleted === true) return false
        const explicitAvailability = availabilityByCombo.get(combo._id)
        // Strict mode: combo is available only with an explicit available=true record.
        return explicitAvailability === true
      })
      .map((combo) => combo._id)

    // Fetch each available combo with its full slot tree
    const combos = await Promise.all(
      availableComboIds.map(async (comboId) => {
        const combo = await ctx.db.get(comboId)
        if (!combo || !combo.isActive || combo.isDeleted === true) return null

        const slots = await ctx.db
          .query("comboSlots")
          .withIndex("by_combo_id", (q) => q.eq("comboId", comboId))
          .collect()

        slots.sort((a, b) => a.sortOrder - b.sortOrder)

        const populatedSlots = await Promise.all(
          slots.map(async (slot) => {
            const options = await ctx.db
              .query("comboSlotOptions")
              .withIndex("by_combo_slot_id", (q) =>
                q.eq("comboSlotId", slot._id)
              )
              .collect()

            options.sort((a, b) => a.sortOrder - b.sortOrder)

            const populatedOptions = await Promise.all(
              options.map(async (option) => {
                const product = await ctx.db.get(option.menuProductId)
                return {
                  menuProductId: option.menuProductId as string,
                  menuProductName: product?.name ?? "Producto eliminado",
                  upcharge: option.upcharge,
                  isDefault: option.isDefault,
                }
              })
            )

            return {
              name: slot.name,
              minSelections: slot.minSelections,
              maxSelections: slot.maxSelections,
              options: populatedOptions,
            }
          })
        )

        return {
          _id: combo._id,
          name: combo.name,
          description: combo.description,
          basePrice: combo.basePrice,
          slots: populatedSlots,
        }
      })
    )

    return combos.filter((c) => c !== null)
  },
})

export const isComboAvailableAtLocation = internalQuery({
  args: {
    comboId: v.id("combos"),
    restaurantLocationId: v.id("restaurantLocations"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo || combo.isDeleted === true || !combo.isActive) return false

    const record = await ctx.db
      .query("comboAvailability")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .filter((q) =>
        q.eq(
          q.field("restaurantLocationId"),
          args.restaurantLocationId as Id<"restaurantLocations">
        )
      )
      .unique()

    // Strict mode: missing availability row means not available.
    return record?.available ?? false
  },
})

export const getComboWithTree = internalQuery({
  args: {
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) return null
    if (!combo.isActive || combo.isDeleted === true) return null

    const slots = await ctx.db
      .query("comboSlots")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .collect()

    slots.sort((a, b) => a.sortOrder - b.sortOrder)

    const populatedSlots = await Promise.all(
      slots.map(async (slot) => {
        const options = await ctx.db
          .query("comboSlotOptions")
          .withIndex("by_combo_slot_id", (q) => q.eq("comboSlotId", slot._id))
          .collect()

        options.sort((a, b) => a.sortOrder - b.sortOrder)

        const populatedOptions = await Promise.all(
          options.map(async (option) => {
            const product = await ctx.db.get(option.menuProductId)
            return {
              _id: option._id,
              comboSlotId: option.comboSlotId,
              menuProductId: option.menuProductId,
              menuProductName: product?.name ?? "Producto eliminado",
              upcharge: option.upcharge,
              isDefault: option.isDefault,
              sortOrder: option.sortOrder,
            }
          })
        )

        return {
          _id: slot._id,
          comboId: slot.comboId,
          name: slot.name,
          minSelections: slot.minSelections,
          maxSelections: slot.maxSelections,
          sortOrder: slot.sortOrder,
          options: populatedOptions,
        }
      })
    )

    return {
      _id: combo._id,
      name: combo.name,
      description: combo.description,
      basePrice: combo.basePrice,
      isActive: combo.isActive,
      organizationId: combo.organizationId,
      slots: populatedSlots,
    }
  },
})
