import { v } from "convex/values"
import * as XLSX from "xlsx"
import type { Id } from "../_generated/dataModel"
import { BadRequestError, NotFoundError } from "../lib/errors"
import { authMutation, authQuery } from "../lib/helpers"

const comboSlotOptionValidator = v.object({
  menuProductId: v.id("menuProducts"),
  upcharge: v.number(),
  isDefault: v.optional(v.boolean()),
  sortOrder: v.number(),
})

const comboSlotValidator = v.object({
  name: v.string(),
  minSelections: v.number(),
  maxSelections: v.number(),
  sortOrder: v.number(),
  options: v.array(comboSlotOptionValidator),
})

// ─── Helper: populate combo tree ────────────────────────────────────────────

/**
 * Fetches slots and options for a given combo, returning the fully populated tree.
 * Each slot includes its options with the linked menuProduct name attached.
 */
async function populateComboTree(ctx: { db: any }, comboId: Id<"combos">) {
  const slots = await ctx.db
    .query("comboSlots")
    .withIndex("by_combo_id", (q: any) => q.eq("comboId", comboId))
    .collect()

  // Sort slots by sortOrder
  slots.sort((a: any, b: any) => a.sortOrder - b.sortOrder)

  const populatedSlots = await Promise.all(
    slots.map(async (slot: any) => {
      const options = await ctx.db
        .query("comboSlotOptions")
        .withIndex("by_combo_slot_id", (q: any) =>
          q.eq("comboSlotId", slot._id)
        )
        .collect()

      // Sort options by sortOrder
      options.sort((a: any, b: any) => a.sortOrder - b.sortOrder)

      const populatedOptions = await Promise.all(
        options.map(async (option: any) => {
          const product = await ctx.db.get(option.menuProductId)
          return {
            _id: option._id,
            _creationTime: option._creationTime,
            comboSlotId: option.comboSlotId,
            menuProductId: option.menuProductId,
            menuProductName: product?.name ?? "Producto eliminado",
            upcharge: option.upcharge,
            isDefault: option.isDefault,
            sortOrder: option.sortOrder,
            organizationId: option.organizationId,
          }
        })
      )

      return {
        _id: slot._id,
        _creationTime: slot._creationTime,
        comboId: slot.comboId,
        name: slot.name,
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        sortOrder: slot.sortOrder,
        organizationId: slot.organizationId,
        options: populatedOptions,
      }
    })
  )

  return populatedSlots
}

// ─── Queries ────────────────────────────────────────────────────────────────

export const list = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const combos = await ctx.db
      .query("combos")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.neq(q.field("isDeleted"), true))
      .collect()

    const combosWithSlots = await Promise.all(
      combos.map(async (combo) => {
        const slots = await populateComboTree(ctx, combo._id)
        return { ...combo, slots }
      })
    )

    return combosWithSlots
  },
})

export const get = authQuery({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) {
      throw new NotFoundError("Combo no encontrado")
    }
    if (combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    const slots = await populateComboTree(ctx, combo._id)
    return { ...combo, slots }
  },
})

export const getAvailableByLocation = authQuery({
  args: {
    organizationId: v.string(),
    locationId: v.id("restaurantLocations"),
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
        q.eq("restaurantLocationId", args.locationId)
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

    // Fetch each available combo and populate its tree
    const combos = await Promise.all(
      availableComboIds.map(async (comboId) => {
        const combo = await ctx.db.get(comboId)
        if (!combo || !combo.isActive || combo.isDeleted === true) return null
        const slots = await populateComboTree(ctx, combo._id)
        return { ...combo, slots }
      })
    )

    return combos.filter((c) => c !== null)
  },
})

export const exportCombosToXlsx = authQuery({
  args: { organizationId: v.string(), trigger: v.optional(v.string()) },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    if (!args.trigger) return null

    const [combos, slots, options, menuProducts, categories, sizes, locations] =
      await Promise.all([
        ctx.db
          .query("combos")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.neq(q.field("isDeleted"), true))
          .collect(),
        ctx.db
          .query("comboSlots")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("comboSlotOptions")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("menuProducts")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("menuProductCategories")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("sizes")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
        ctx.db
          .query("restaurantLocations")
          .withIndex("by_organization_id", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect(),
      ])

    const comboIds = new Set(combos.map((combo) => combo._id))
    const slotsByComboId = new Map<string, Array<(typeof slots)[number]>>()
    const optionsBySlotId = new Map<string, Array<(typeof options)[number]>>()
    const menuProductById = new Map(menuProducts.map((p) => [p._id, p]))
    const categoryById = new Map(categories.map((c) => [c._id, c.name]))
    const sizeById = new Map(sizes.map((s) => [s._id, s.name]))
    const locationCodeById = new Map(locations.map((l) => [l._id, l.code]))

    const comboAvailability = await ctx.db
      .query("comboAvailability")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const disabledLocationsByCombo = new Map<string, string[]>()
    for (const combo of combos) {
      disabledLocationsByCombo.set(combo._id, [])
    }
    for (const availability of comboAvailability) {
      if (!comboIds.has(availability.comboId) || availability.available)
        continue
      const locationCode = locationCodeById.get(
        availability.restaurantLocationId
      )
      if (!locationCode) continue
      const list = disabledLocationsByCombo.get(availability.comboId) ?? []
      list.push(locationCode)
      disabledLocationsByCombo.set(availability.comboId, list)
    }

    for (const slot of slots) {
      const list = slotsByComboId.get(slot.comboId) ?? []
      list.push(slot)
      slotsByComboId.set(slot.comboId, list)
    }
    for (const option of options) {
      const list = optionsBySlotId.get(option.comboSlotId) ?? []
      list.push(option)
      optionsBySlotId.set(option.comboSlotId, list)
    }

    const rows: Array<Record<string, string | number>> = []
    for (const combo of combos) {
      const comboSlots = (slotsByComboId.get(combo._id) ?? []).sort(
        (a, b) => a.sortOrder - b.sortOrder
      )
      for (const slot of comboSlots) {
        const slotOptions = (optionsBySlotId.get(slot._id) ?? []).sort(
          (a, b) => a.sortOrder - b.sortOrder
        )
        for (const option of slotOptions) {
          const menuProduct = menuProductById.get(option.menuProductId)
          rows.push({
            id_combo: combo._id,
            nombre_combo: combo.name,
            descripcion_combo: combo.description,
            precio_base_combo: combo.basePrice,
            activo_combo: combo.isActive ? "si" : "no",
            link_imagen_combo: combo.imageUrl || "",
            slot_orden: slot.sortOrder,
            slot_nombre: slot.name,
            slot_min: slot.minSelections,
            slot_max: slot.maxSelections,
            opcion_orden: option.sortOrder,
            opcion_default: option.isDefault ? "si" : "no",
            opcion_recargo: option.upcharge,
            menu_product_id: option.menuProductId,
            menu_producto: menuProduct?.name || "",
            menu_categoria: menuProduct
              ? (categoryById.get(menuProduct.menuProductCategoryId) ?? "")
              : "",
            menu_tamaño:
              menuProduct && menuProduct.sizeId
                ? (sizeById.get(menuProduct.sizeId) ?? "")
                : "",
            deshabilitar_en:
              disabledLocationsByCombo.get(combo._id)?.join(";") || "",
          })
        }
      }
    }

    const workbook = XLSX.utils.book_new()
    const todosSheet = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(workbook, todosSheet, "TODOS")

    // Generate XLSX directly as base64 (Buffer is not available in Convex V8 runtime)
    const base64: string = XLSX.write(workbook, {
      type: "base64",
      bookType: "xlsx",
    })

    return base64
  },
})

// ─── Mutations ──────────────────────────────────────────────────────────────

export const create = authMutation({
  args: {
    organizationId: v.string(),
    name: v.string(),
    description: v.string(),
    basePrice: v.number(),
    imageUrl: v.optional(v.string()),
    isActive: v.boolean(),
    slots: v.array(comboSlotValidator),
  },
  handler: async (ctx, args) => {
    // Validate name
    if (!args.name.trim()) {
      throw new BadRequestError("El nombre del combo no puede estar vacío")
    }

    // Validate basePrice
    if (args.basePrice < 0) {
      throw new BadRequestError(
        "El precio base del combo no puede ser negativo"
      )
    }

    // Create combo
    const comboId = await ctx.db.insert("combos", {
      name: args.name.trim(),
      description: args.description.trim(),
      basePrice: args.basePrice,
      imageUrl: args.imageUrl,
      isActive: args.isActive,
      organizationId: args.organizationId,
    })

    // Create all slots and their options
    for (const slot of args.slots) {
      if (slot.minSelections > slot.maxSelections) {
        throw new BadRequestError(
          `El mínimo de selecciones no puede ser mayor que el máximo en el slot "${slot.name}"`
        )
      }

      const slotId = await ctx.db.insert("comboSlots", {
        comboId,
        name: slot.name.trim(),
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        sortOrder: slot.sortOrder,
        organizationId: args.organizationId,
      })

      for (const option of slot.options) {
        // Verify menuProduct exists and belongs to org
        const product = await ctx.db.get(option.menuProductId)
        if (!product || product.organizationId !== args.organizationId) {
          throw new BadRequestError(
            `Producto ${option.menuProductId} no encontrado o no pertenece a esta organización`
          )
        }

        await ctx.db.insert("comboSlotOptions", {
          comboSlotId: slotId,
          menuProductId: option.menuProductId,
          upcharge: option.upcharge,
          isDefault: option.isDefault,
          sortOrder: option.sortOrder,
          organizationId: args.organizationId,
        })
      }
    }

    // By default, new combos are available in all existing locations.
    const locations = await ctx.db
      .query("restaurantLocations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    await Promise.all(
      locations.map((location) =>
        ctx.db.insert("comboAvailability", {
          comboId,
          restaurantLocationId: location._id,
          available: true,
          organizationId: args.organizationId,
        })
      )
    )

    return comboId
  },
})

export const update = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    basePrice: v.optional(v.number()),
    imageUrl: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    slots: v.optional(v.array(comboSlotValidator)),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) {
      throw new NotFoundError("Combo no encontrado")
    }
    if (combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    // Validate name if provided
    if (args.name !== undefined && !args.name.trim()) {
      throw new BadRequestError("El nombre del combo no puede estar vacío")
    }

    // Validate basePrice if provided
    if (args.basePrice !== undefined && args.basePrice < 0) {
      throw new BadRequestError(
        "El precio base del combo no puede ser negativo"
      )
    }

    const updateData: Record<string, unknown> = {}
    if (args.name !== undefined) updateData.name = args.name.trim()
    if (args.description !== undefined)
      updateData.description = args.description.trim()
    if (args.basePrice !== undefined) updateData.basePrice = args.basePrice
    if (args.imageUrl !== undefined) updateData.imageUrl = args.imageUrl
    if (args.isActive !== undefined) updateData.isActive = args.isActive

    await ctx.db.patch(args.comboId, updateData)

    if (args.slots) {
      // Replace existing slots + options in the same mutation to keep edits atomic.
      const existingSlots = await ctx.db
        .query("comboSlots")
        .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
        .collect()

      for (const slot of existingSlots) {
        const existingOptions = await ctx.db
          .query("comboSlotOptions")
          .withIndex("by_combo_slot_id", (q) => q.eq("comboSlotId", slot._id))
          .collect()

        for (const option of existingOptions) {
          await ctx.db.delete(option._id)
        }

        await ctx.db.delete(slot._id)
      }

      for (const slot of args.slots) {
        if (slot.minSelections > slot.maxSelections) {
          throw new BadRequestError(
            `El mínimo de selecciones no puede ser mayor que el máximo en el slot "${slot.name}"`
          )
        }

        const slotId = await ctx.db.insert("comboSlots", {
          comboId: args.comboId,
          name: slot.name.trim(),
          minSelections: slot.minSelections,
          maxSelections: slot.maxSelections,
          sortOrder: slot.sortOrder,
          organizationId: args.organizationId,
        })

        for (const option of slot.options) {
          const product = await ctx.db.get(option.menuProductId)
          if (!product || product.organizationId !== args.organizationId) {
            throw new BadRequestError(
              `Producto ${option.menuProductId} no encontrado o no pertenece a esta organización`
            )
          }

          await ctx.db.insert("comboSlotOptions", {
            comboSlotId: slotId,
            menuProductId: option.menuProductId,
            upcharge: option.upcharge,
            isDefault: option.isDefault,
            sortOrder: option.sortOrder,
            organizationId: args.organizationId,
          })
        }
      }
    }

    return args.comboId
  },
})

export const updateSlots = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
    slots: v.array(comboSlotValidator),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) {
      throw new NotFoundError("Combo no encontrado")
    }
    if (combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    // Delete existing slots and their options
    const existingSlots = await ctx.db
      .query("comboSlots")
      .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
      .collect()

    for (const slot of existingSlots) {
      // Delete all options for this slot
      const existingOptions = await ctx.db
        .query("comboSlotOptions")
        .withIndex("by_combo_slot_id", (q) => q.eq("comboSlotId", slot._id))
        .collect()

      for (const option of existingOptions) {
        await ctx.db.delete(option._id)
      }

      await ctx.db.delete(slot._id)
    }

    // Create new slots and options
    for (const slot of args.slots) {
      if (slot.minSelections > slot.maxSelections) {
        throw new BadRequestError(
          `El mínimo de selecciones no puede ser mayor que el máximo en el slot "${slot.name}"`
        )
      }

      const slotId = await ctx.db.insert("comboSlots", {
        comboId: args.comboId,
        name: slot.name.trim(),
        minSelections: slot.minSelections,
        maxSelections: slot.maxSelections,
        sortOrder: slot.sortOrder,
        organizationId: args.organizationId,
      })

      for (const option of slot.options) {
        // Verify menuProduct exists and belongs to org
        const product = await ctx.db.get(option.menuProductId)
        if (!product || product.organizationId !== args.organizationId) {
          throw new BadRequestError(
            `Producto ${option.menuProductId} no encontrado o no pertenece a esta organización`
          )
        }

        await ctx.db.insert("comboSlotOptions", {
          comboSlotId: slotId,
          menuProductId: option.menuProductId,
          upcharge: option.upcharge,
          isDefault: option.isDefault,
          sortOrder: option.sortOrder,
          organizationId: args.organizationId,
        })
      }
    }

    return args.comboId
  },
})

export const remove = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) {
      throw new NotFoundError("Combo no encontrado")
    }
    if (combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    await ctx.db.patch(args.comboId, { isDeleted: true })

    // Preserved for future hard-delete of combos with zero order references
    // // Cascade delete: slots → options
    // const existingSlots = await ctx.db
    //   .query("comboSlots")
    //   .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
    //   .collect()
    //
    // for (const slot of existingSlots) {
    //   const existingOptions = await ctx.db
    //     .query("comboSlotOptions")
    //     .withIndex("by_combo_slot_id", (q) => q.eq("comboSlotId", slot._id))
    //     .collect()
    //
    //   for (const option of existingOptions) {
    //     await ctx.db.delete(option._id)
    //   }
    //
    //   await ctx.db.delete(slot._id)
    // }
    //
    // // Cascade delete: availability records
    // const availabilityRecords = await ctx.db
    //   .query("comboAvailability")
    //   .withIndex("by_combo_id", (q) => q.eq("comboId", args.comboId))
    //   .collect()
    //
    // for (const record of availabilityRecords) {
    //   await ctx.db.delete(record._id)
    // }
    //
    // // Delete combo itself
    // await ctx.db.delete(args.comboId)
  },
})

export const toggleActive = authMutation({
  args: {
    organizationId: v.string(),
    comboId: v.id("combos"),
  },
  handler: async (ctx, args) => {
    const combo = await ctx.db.get(args.comboId)
    if (!combo) {
      throw new NotFoundError("Combo no encontrado")
    }
    if (combo.organizationId !== args.organizationId) {
      throw new NotFoundError("Combo no encontrado")
    }

    await ctx.db.patch(args.comboId, { isActive: !combo.isActive })
    return { isActive: !combo.isActive }
  },
})
