import { v } from "convex/values"
import * as XLSX from "xlsx"
import type { Id } from "../_generated/dataModel"
import { authMutation } from "../lib/helpers"

type ConflictResolution = "skip" | "overwrite" | "substitute"

type ParsedRow = {
  rowNumber: number
  comboId?: string
  comboName: string
  comboDescription: string
  comboBasePrice: number
  comboIsActive: boolean
  comboImageUrl?: string
  slotOrder: number
  slotName: string
  slotMin: number
  slotMax: number
  optionOrder: number
  optionIsDefault: boolean
  optionUpcharge: number
  menuProductId?: string
  menuProductName?: string
  menuCategoryName?: string
  menuSizeName?: string
  disabledLocationCodes: string[]
}

type ParsedCombo = {
  key: string
  sourceComboId?: Id<"combos"> | string
  name: string
  description: string
  basePrice: number
  isActive: boolean
  imageUrl?: string
  disabledLocationCodes: string[]
  rowNumbers: number[]
  slots: Array<{
    key: string
    sortOrder: number
    name: string
    minSelections: number
    maxSelections: number
    options: Array<{
      sortOrder: number
      isDefault: boolean
      upcharge: number
      menuProductId?: string
      menuProductName?: string
      menuCategoryName?: string
      menuSizeName?: string
      resolvedMenuProductId?: Id<"menuProducts">
      rowNumber: number
    }>
  }>
}

export interface ComboImportPreview {
  combos: Array<{
    id?: string
    name: string
    description: string
    basePrice: number
    isActive: boolean
    rowNumbers: number[]
    slotCount: number
    optionCount: number
    unresolvedOptions: number
    conflicts: string[]
    warnings: string[]
    willOverwrite: boolean
    dbDuplicate: boolean
  }>
  totalCombos: number
  newCombos: number
  conflictingCombos: number
  errors: string[]
  warnings: string[]
}

export interface ComboImportResult {
  success: boolean
  importedCombos: number
  skippedCombos: number
  deletedCombos: number
  errors: string[]
}

function normalize(value: string | undefined | null): string {
  return (value || "").trim().toLowerCase()
}

function parseBoolean(value: string | undefined, fallback = true): boolean {
  if (!value) return fallback
  const normalized = normalize(value)
  return normalized === "si" || normalized === "sí" || normalized === "true"
}

function parseNumber(value: string | number | undefined, fallback = 0): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? value : fallback
  if (!value) return fallback
  const normalized = String(value).trim().replace(",", ".")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseInteger(
  value: string | number | undefined,
  fallback = 0
): number {
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.trunc(value) : fallback
  if (!value) return fallback
  const normalized = String(value).trim().replace(",", ".")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
}

function parseCsvContent(csvContent: string): ParsedRow[] {
  const workbook = XLSX.read(csvContent, { type: "string" })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error("El archivo no contiene hojas válidas")
  }

  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    throw new Error("No se pudo leer la hoja del archivo")
  }

  const data = XLSX.utils.sheet_to_json<Record<string, string | number>>(
    sheet,
    {
      defval: "",
      raw: false,
    }
  )

  return data.map((row, idx) => {
    const disabledLocationCodes = String(row.deshabilitar_en || "")
      .split(";")
      .map((code) => code.trim())
      .filter(Boolean)

    return {
      rowNumber: idx + 2,
      comboId: String(row.id_combo || "").trim() || undefined,
      comboName: String(row.nombre_combo || "").trim(),
      comboDescription: String(row.descripcion_combo || "").trim(),
      comboBasePrice: parseNumber(row.precio_base_combo, 0),
      comboIsActive: parseBoolean(String(row.activo_combo || ""), true),
      comboImageUrl: String(row.link_imagen_combo || "").trim() || undefined,
      slotOrder: parseInteger(row.slot_orden, 0),
      slotName: String(row.slot_nombre || "").trim(),
      slotMin: parseInteger(row.slot_min, 0),
      slotMax: parseInteger(row.slot_max, 1),
      optionOrder: parseInteger(row.opcion_orden, 0),
      optionIsDefault: parseBoolean(String(row.opcion_default || ""), false),
      optionUpcharge: parseNumber(row.opcion_recargo, 0),
      menuProductId: String(row.menu_product_id || "").trim() || undefined,
      menuProductName: String(row.menu_producto || "").trim() || undefined,
      menuCategoryName: String(row.menu_categoria || "").trim() || undefined,
      menuSizeName: String(row.menu_tamaño || "").trim() || undefined,
      disabledLocationCodes,
    }
  })
}

function buildParsedCombos(rows: ParsedRow[]): ParsedCombo[] {
  const comboMap = new Map<string, ParsedCombo>()

  for (const row of rows) {
    const comboKey = row.comboId || normalize(row.comboName)
    const slotKey = `${comboKey}|${row.slotOrder}|${normalize(row.slotName)}`

    const combo =
      comboMap.get(comboKey) ||
      ({
        key: comboKey,
        sourceComboId: row.comboId,
        name: row.comboName,
        description: row.comboDescription,
        basePrice: row.comboBasePrice,
        isActive: row.comboIsActive,
        imageUrl: row.comboImageUrl,
        disabledLocationCodes: [...row.disabledLocationCodes],
        rowNumbers: [row.rowNumber],
        slots: [],
      } as ParsedCombo)

    if (!comboMap.has(comboKey)) {
      comboMap.set(comboKey, combo)
    } else {
      combo.rowNumbers.push(row.rowNumber)
      combo.disabledLocationCodes = Array.from(
        new Set([...combo.disabledLocationCodes, ...row.disabledLocationCodes])
      )
    }

    let slot = combo.slots.find((s) => s.key === slotKey)
    if (!slot) {
      slot = {
        key: slotKey,
        sortOrder: row.slotOrder,
        name: row.slotName,
        minSelections: row.slotMin,
        maxSelections: row.slotMax,
        options: [],
      }
      combo.slots.push(slot)
    }

    slot.options.push({
      sortOrder: row.optionOrder,
      isDefault: row.optionIsDefault,
      upcharge: row.optionUpcharge,
      menuProductId: row.menuProductId,
      menuProductName: row.menuProductName,
      menuCategoryName: row.menuCategoryName,
      menuSizeName: row.menuSizeName,
      rowNumber: row.rowNumber,
    })
  }

  return Array.from(comboMap.values()).map((combo) => ({
    ...combo,
    slots: combo.slots
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((slot) => ({
        ...slot,
        options: slot.options.sort((a, b) => a.sortOrder - b.sortOrder),
      })),
  }))
}

async function resolveComboOptions(
  combo: ParsedCombo,
  menuProducts: Array<{
    _id: Id<"menuProducts">
    name: string
    menuProductCategoryId: Id<"menuProductCategories">
    sizeId?: Id<"sizes">
  }>,
  categoryMap: Map<Id<"menuProductCategories">, string>,
  sizeMap: Map<Id<"sizes">, string>
): Promise<{ unresolvedCount: number; warnings: string[] }> {
  let unresolvedCount = 0
  const warnings: string[] = []

  for (const slot of combo.slots) {
    for (const option of slot.options) {
      let matched =
        option.menuProductId &&
        menuProducts.find((p) => p._id === option.menuProductId)

      if (!matched && option.menuProductName && option.menuCategoryName) {
        const normalizedName = normalize(option.menuProductName)
        const normalizedCategory = normalize(option.menuCategoryName)
        const normalizedSize = normalize(option.menuSizeName)

        matched = menuProducts.find((product) => {
          const categoryName = categoryMap.get(product.menuProductCategoryId)
          if (!categoryName) return false
          if (normalize(product.name) !== normalizedName) return false
          if (normalize(categoryName) !== normalizedCategory) return false

          const productSizeName = product.sizeId
            ? sizeMap.get(product.sizeId as Id<"sizes">)
            : ""

          return normalize(productSizeName) === normalizedSize
        })
      }

      if (!matched) {
        unresolvedCount += 1
        warnings.push(
          `Fila ${option.rowNumber}: no se pudo resolver el producto de la opción en slot "${slot.name}" del combo "${combo.name}".`
        )
        continue
      }

      option.resolvedMenuProductId = matched._id
    }
  }

  return { unresolvedCount, warnings }
}

async function replaceComboTree(
  ctx: { db: any },
  comboId: Id<"combos">,
  organizationId: string,
  slots: ParsedCombo["slots"]
) {
  const existingSlots = await ctx.db
    .query("comboSlots")
    .withIndex("by_combo_id", (q: any) => q.eq("comboId", comboId))
    .collect()

  for (const slot of existingSlots) {
    const existingOptions = await ctx.db
      .query("comboSlotOptions")
      .withIndex("by_combo_slot_id", (q: any) => q.eq("comboSlotId", slot._id))
      .collect()

    for (const option of existingOptions) {
      await ctx.db.delete(option._id)
    }
    await ctx.db.delete(slot._id)
  }

  for (const slot of slots) {
    const slotId = await ctx.db.insert("comboSlots", {
      comboId,
      name: slot.name,
      minSelections: slot.minSelections,
      maxSelections: slot.maxSelections,
      sortOrder: slot.sortOrder,
      organizationId,
    })

    for (const option of slot.options) {
      if (!option.resolvedMenuProductId) continue
      await ctx.db.insert("comboSlotOptions", {
        comboSlotId: slotId,
        menuProductId: option.resolvedMenuProductId,
        upcharge: option.upcharge,
        isDefault: option.isDefault,
        sortOrder: option.sortOrder,
        organizationId,
      })
    }
  }
}

async function setComboAvailability(
  ctx: { db: any },
  comboId: Id<"combos">,
  organizationId: string,
  disabledLocationCodes: string[],
  locations: Array<{ _id: Id<"restaurantLocations">; code: string }>
) {
  const disabledCodes = new Set(
    disabledLocationCodes.map((code) => normalize(code))
  )
  const existingRecords = await ctx.db
    .query("comboAvailability")
    .withIndex("by_combo_id", (q: any) => q.eq("comboId", comboId))
    .collect()

  const recordByLocationId = new Map<
    Id<"restaurantLocations">,
    { _id: Id<"comboAvailability">; available: boolean }
  >(
    existingRecords
      .filter((record: any) => record.organizationId === organizationId)
      .map((record: any) => [
        record.restaurantLocationId,
        { _id: record._id, available: record.available },
      ])
  )

  for (const location of locations) {
    const available = !disabledCodes.has(normalize(location.code))
    const existing = recordByLocationId.get(location._id)
    if (!existing) {
      await ctx.db.insert("comboAvailability", {
        comboId,
        restaurantLocationId: location._id,
        available,
        organizationId,
      })
      continue
    }

    if (existing.available !== available) {
      await ctx.db.patch(existing._id, { available })
    }
  }
}

export const previewComboImport = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
    conflictResolution: v.optional(
      v.union(
        v.literal("skip"),
        v.literal("overwrite"),
        v.literal("substitute")
      )
    ),
  },
  handler: async (ctx, args): Promise<ComboImportPreview> => {
    try {
      const rows = parseCsvContent(args.csvContent)
      const parsedCombos = buildParsedCombos(rows)

      const [existingCombos, menuProducts, categories, sizes, locations] =
        await Promise.all([
          ctx.db
            .query("combos")
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

      const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))
      const sizeMap = new Map(sizes.map((size) => [size._id, size.name]))
      const existingById = new Map(
        existingCombos.map((combo) => [combo._id, combo])
      )
      const existingByName = new Map(
        existingCombos.map((combo) => [normalize(combo.name), combo])
      )
      const validLocationCodes = new Set(
        locations.map((location) => normalize(location.code))
      )

      const combos: ComboImportPreview["combos"] = []
      const warnings: string[] = []
      const errors: string[] = []
      let newCombos = 0
      let conflictingCombos = 0

      for (const parsedCombo of parsedCombos) {
        const conflicts: string[] = []
        const itemWarnings: string[] = []

        if (!parsedCombo.name) {
          errors.push(
            `Filas ${parsedCombo.rowNumbers.join(", ")}: el combo no tiene nombre.`
          )
          continue
        }

        if (parsedCombo.basePrice < 0) {
          conflicts.push("El precio base no puede ser negativo")
        }

        if (parsedCombo.slots.length === 0) {
          conflicts.push("El combo debe tener al menos un slot")
        }

        for (const slot of parsedCombo.slots) {
          if (!slot.name) {
            conflicts.push(`El slot de orden ${slot.sortOrder} no tiene nombre`)
          }
          if (slot.minSelections > slot.maxSelections) {
            conflicts.push(
              `El slot "${slot.name}" tiene min (${slot.minSelections}) mayor que max (${slot.maxSelections})`
            )
          }
          if (slot.options.length === 0) {
            conflicts.push(`El slot "${slot.name}" no tiene opciones`)
          }
        }

        const { unresolvedCount, warnings: optionWarnings } =
          await resolveComboOptions(
            parsedCombo,
            menuProducts,
            categoryMap,
            sizeMap
          )
        itemWarnings.push(...optionWarnings)

        const invalidCodes = parsedCombo.disabledLocationCodes.filter(
          (code) => !validLocationCodes.has(normalize(code))
        )
        if (invalidCodes.length > 0) {
          conflicts.push(
            `Códigos de sucursal inválidos en deshabilitar_en: ${invalidCodes.join(", ")}`
          )
        }

        const existingCombo =
          (parsedCombo.sourceComboId
            ? existingById.get(parsedCombo.sourceComboId as Id<"combos">)
            : undefined) || existingByName.get(normalize(parsedCombo.name))

        const isSkipMode =
          !args.conflictResolution || args.conflictResolution === "skip"
        const dbDuplicate = Boolean(existingCombo)
        const willOverwrite = Boolean(existingCombo) && !isSkipMode

        if (conflicts.length > 0 || unresolvedCount > 0) {
          conflictingCombos += 1
        } else if (existingCombo) {
          conflictingCombos += 1
        } else {
          newCombos += 1
        }

        combos.push({
          id: parsedCombo.sourceComboId,
          name: parsedCombo.name,
          description: parsedCombo.description,
          basePrice: parsedCombo.basePrice,
          isActive: parsedCombo.isActive,
          rowNumbers: parsedCombo.rowNumbers,
          slotCount: parsedCombo.slots.length,
          optionCount: parsedCombo.slots.reduce(
            (sum, slot) => sum + slot.options.length,
            0
          ),
          unresolvedOptions: unresolvedCount,
          conflicts,
          warnings: itemWarnings,
          willOverwrite,
          dbDuplicate,
        })

        warnings.push(...itemWarnings)
      }

      return {
        combos,
        totalCombos: parsedCombos.length,
        newCombos,
        conflictingCombos,
        errors,
        warnings,
      }
    } catch (error) {
      return {
        combos: [],
        totalCombos: 0,
        newCombos: 0,
        conflictingCombos: 0,
        errors: [
          error instanceof Error
            ? `Error al procesar archivo: ${error.message}`
            : "Error al procesar archivo",
        ],
        warnings: [],
      }
    }
  },
})

export const importComboData = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
    conflictResolution: v.union(
      v.literal("skip"),
      v.literal("overwrite"),
      v.literal("substitute")
    ),
  },
  handler: async (ctx, args): Promise<ComboImportResult> => {
    try {
      const rows = parseCsvContent(args.csvContent)
      const parsedCombos = buildParsedCombos(rows)

      const [existingCombos, menuProducts, categories, sizes, locations] =
        await Promise.all([
          ctx.db
            .query("combos")
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

      const categoryMap = new Map(categories.map((cat) => [cat._id, cat.name]))
      const sizeMap = new Map(sizes.map((size) => [size._id, size.name]))
      const existingById = new Map(
        existingCombos.map((combo) => [combo._id, combo])
      )
      const existingByName = new Map(
        existingCombos.map((combo) => [normalize(combo.name), combo])
      )
      const validLocationCodes = new Set(
        locations.map((location) => normalize(location.code))
      )

      let importedCombos = 0
      let skippedCombos = 0
      const errors: string[] = []
      const processedComboIds = new Set<Id<"combos">>()

      for (const parsedCombo of parsedCombos) {
        if (!parsedCombo.name) {
          errors.push(
            `Filas ${parsedCombo.rowNumbers.join(", ")}: el combo no tiene nombre.`
          )
          skippedCombos += 1
          continue
        }

        if (parsedCombo.basePrice < 0) {
          errors.push(`Combo "${parsedCombo.name}": precio base inválido.`)
          skippedCombos += 1
          continue
        }

        const invalidCodes = parsedCombo.disabledLocationCodes.filter(
          (code) => !validLocationCodes.has(normalize(code))
        )
        if (invalidCodes.length > 0) {
          errors.push(
            `Combo "${parsedCombo.name}": códigos inválidos en deshabilitar_en (${invalidCodes.join(", ")}).`
          )
          skippedCombos += 1
          continue
        }

        const { unresolvedCount } = await resolveComboOptions(
          parsedCombo,
          menuProducts,
          categoryMap,
          sizeMap
        )

        if (unresolvedCount > 0) {
          errors.push(
            `Combo "${parsedCombo.name}": tiene opciones no resolubles (${unresolvedCount}).`
          )
          skippedCombos += 1
          continue
        }

        let invalidSlot = false
        for (const slot of parsedCombo.slots) {
          if (
            !slot.name ||
            slot.options.length === 0 ||
            slot.minSelections > slot.maxSelections
          ) {
            invalidSlot = true
            break
          }
        }
        if (invalidSlot || parsedCombo.slots.length === 0) {
          errors.push(
            `Combo "${parsedCombo.name}": estructura de slots inválida.`
          )
          skippedCombos += 1
          continue
        }

        const existingCombo =
          (parsedCombo.sourceComboId
            ? existingById.get(parsedCombo.sourceComboId as Id<"combos">)
            : undefined) || existingByName.get(normalize(parsedCombo.name))

        if (existingCombo && args.conflictResolution === "skip") {
          processedComboIds.add(existingCombo._id)
          skippedCombos += 1
          continue
        }

        let comboId: Id<"combos">
        if (existingCombo) {
          comboId = existingCombo._id
          await ctx.db.patch(comboId, {
            name: parsedCombo.name,
            description: parsedCombo.description,
            basePrice: parsedCombo.basePrice,
            imageUrl: parsedCombo.imageUrl,
            isActive: parsedCombo.isActive,
            isDeleted: false,
          })
        } else {
          comboId = await ctx.db.insert("combos", {
            name: parsedCombo.name,
            description: parsedCombo.description,
            basePrice: parsedCombo.basePrice,
            imageUrl: parsedCombo.imageUrl,
            isActive: parsedCombo.isActive,
            isDeleted: false,
            organizationId: args.organizationId,
          })
        }

        await replaceComboTree(
          ctx,
          comboId,
          args.organizationId,
          parsedCombo.slots
        )
        await setComboAvailability(
          ctx,
          comboId,
          args.organizationId,
          parsedCombo.disabledLocationCodes,
          locations
        )

        processedComboIds.add(comboId)
        importedCombos += 1
      }

      let deletedCombos = 0
      if (args.conflictResolution === "substitute") {
        const toDelete = existingCombos.filter(
          (combo) => !processedComboIds.has(combo._id)
        )
        for (const combo of toDelete) {
          if (combo.isDeleted === true) continue
          await ctx.db.patch(combo._id, { isDeleted: true })
          deletedCombos += 1
        }
      }

      return {
        success: errors.length === 0,
        importedCombos,
        skippedCombos,
        deletedCombos,
        errors,
      }
    } catch (error) {
      return {
        success: false,
        importedCombos: 0,
        skippedCombos: 0,
        deletedCombos: 0,
        errors: [
          error instanceof Error
            ? `Error al importar combos: ${error.message}`
            : "Error al importar combos",
        ],
      }
    }
  },
})
