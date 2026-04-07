import { v } from "convex/values"
import { internalQuery } from "../_generated/server"
import { aggregateContactsByOrganization } from "../contactsAggregate"
import { authMutation, authQuery } from "../lib/helpers"

export const get = internalQuery({
  args: {
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)

    if (!contact) {
      return null
    }

    return contact
  },
})

export const validate = authMutation({
  args: {
    organizationId: v.string(),
    contactId: v.id("contacts"),
  },
  handler: async (ctx, args) => {
    const contact = await ctx.db.get(args.contactId)

    if (!contact) {
      return { valid: false, reason: "Contacto no encontrado" }
    }

    return { valid: true, contact }
  },
})

export const getByOrganization = authQuery({
  args: {
    organizationId: v.string(),
    paginationOpts: v.any(),
    searchQuery: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const paginationOpts = args.paginationOpts as
      | { numItems: number; cursor: string | null }
      | undefined
    const searchQuery = args.searchQuery as string | undefined

    // Get all contacts for the organization
    const query = ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    // Apply search filter if provided
    if (searchQuery?.trim()) {
      const searchLower = searchQuery.toLowerCase().trim()

      // Collect all contacts and filter in memory
      // This is necessary because we need to search across multiple fields
      const allContacts = await query.collect()

      const filteredContacts = allContacts.filter((contact) => {
        const nameMatch = contact.displayName
          ?.toLowerCase()
          .includes(searchLower)
        const phoneMatch = contact.phoneNumber
          .toLowerCase()
          .includes(searchLower)
        return nameMatch || phoneMatch
      })

      // Manual pagination for filtered results
      const { numItems = 20, cursor } = paginationOpts || {}
      const startIndex = cursor ? parseInt(cursor, 10) : 0
      const endIndex = startIndex + numItems
      const page = filteredContacts.slice(startIndex, endIndex)
      const hasMore = endIndex < filteredContacts.length

      // Get conversation and order counts for each contact in the current page
      const contactsWithDetails = await Promise.all(
        page.map(async (contact) => {
          const conversationCount = await ctx.db
            .query("conversations")
            .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
            .collect()
            .then((conversations) => conversations.length)

          const lastConversation = await ctx.db
            .query("conversations")
            .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
            .order("desc")
            .first()

          const orderCount = await ctx.db
            .query("orders")
            .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
            .collect()
            .then((orders) => orders.length)

          return {
            ...contact,
            conversationCount,
            lastConversation: lastConversation
              ? {
                  _id: lastConversation._id,
                  status: lastConversation.status,
                }
              : null,
            orderCount,
          }
        })
      )

      return {
        page: contactsWithDetails,
        isDone: !hasMore,
        continueCursor: hasMore ? endIndex.toString() : null,
      }
    }

    // No search query - use efficient database pagination
    const paginationResult = await query.paginate(
      paginationOpts || ({ numItems: 20, cursor: null } as any)
    )

    // Get conversation and order counts for each contact in the current page
    const contactsWithDetails = await Promise.all(
      paginationResult.page.map(async (contact) => {
        const conversationCount = await ctx.db
          .query("conversations")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .collect()
          .then((conversations) => conversations.length)

        const lastConversation = await ctx.db
          .query("conversations")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .order("desc")
          .first()

        const orderCount = await ctx.db
          .query("orders")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .collect()
          .then((orders) => orders.length)

        return {
          ...contact,
          conversationCount,
          lastConversation: lastConversation
            ? {
                _id: lastConversation._id,
                status: lastConversation.status,
              }
            : null,
          orderCount,
        }
      })
    )

    return {
      ...paginationResult,
      page: contactsWithDetails,
    }
  },
})

export const update = authMutation({
  args: {
    organizationId: v.string(),
    contactId: v.id("contacts"),
    displayName: v.optional(v.string()),
    isBlocked: v.optional(v.boolean()),
    lastKnownAddress: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { contactId, organizationId, ...updates } = args

    // Verify the contact exists and belongs to the organization
    const contact = await ctx.db.get(contactId)
    if (!contact) {
      throw new Error("Contacto no encontrado")
    }

    if (contact.organizationId !== organizationId) {
      throw new Error("No tienes permisos para editar este contacto")
    }

    // Update the contact
    await ctx.db.patch(contactId, updates)

    return { success: true }
  },
})

export const listForPromptBuilder = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(50) // Limit for performance

    return contacts.map((contact) => ({
      _id: contact._id,
      displayName: contact.displayName,
      phoneNumber: contact.phoneNumber,
      lastMessageAt: contact.lastMessageAt,
    }))
  },
})

// List contacts for campaign recipient selection with search and pagination
export const listForCampaignSelection = authQuery({
  args: {
    organizationId: v.string(),
    searchQuery: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
    excludeBlocked: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 50
    const excludeBlocked = args.excludeBlocked !== false // Default to true

    // Get all contacts for the organization
    let allContacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .collect()

    // Filter out blocked contacts if requested
    if (excludeBlocked) {
      allContacts = allContacts.filter((c) => !c.isBlocked)
    }

    // Apply search filter if provided
    if (args.searchQuery?.trim()) {
      const searchLower = args.searchQuery.toLowerCase().trim()
      allContacts = allContacts.filter((contact) => {
        const nameMatch = contact.displayName
          ?.toLowerCase()
          .includes(searchLower)
        const phoneMatch = contact.phoneNumber
          .toLowerCase()
          .includes(searchLower)
        return nameMatch || phoneMatch
      })
    }

    // Manual pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0
    const endIndex = startIndex + limit
    const page = allContacts.slice(startIndex, endIndex)
    const hasMore = endIndex < allContacts.length

    // Get order counts for each contact
    const contactsWithOrderCount = await Promise.all(
      page.map(async (contact) => {
        const orderCount = await ctx.db
          .query("orders")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .collect()
          .then((orders) => orders.length)

        return {
          _id: contact._id,
          displayName: contact.displayName,
          phoneNumber: contact.phoneNumber,
          lastMessageAt: contact.lastMessageAt,
          lastKnownAddress: contact.lastKnownAddress,
          isBlocked: contact.isBlocked,
          orderCount,
          _creationTime: contact._creationTime,
        }
      })
    )

    return {
      contacts: contactsWithOrderCount,
      totalCount: allContacts.length,
      hasMore,
      nextCursor: hasMore ? endIndex.toString() : null,
    }
  },
})

// Get multiple contacts by IDs (for displaying selected contacts)
export const getByIds = authQuery({
  args: {
    organizationId: v.string(),
    contactIds: v.array(v.id("contacts")),
  },
  handler: async (ctx, args) => {
    const contacts = await Promise.all(
      args.contactIds.map(async (id) => {
        const contact = await ctx.db.get(id)
        if (contact && contact.organizationId === args.organizationId) {
          return {
            _id: contact._id,
            displayName: contact.displayName,
            phoneNumber: contact.phoneNumber,
            isBlocked: contact.isBlocked,
          }
        }
        return null
      })
    )

    return contacts.filter((c): c is NonNullable<typeof c> => c !== null)
  },
})

// ============================================
// CONTACTS CSV IMPORT
// ============================================

// Helper function to normalize phone numbers
function normalizePhoneNumber(phone: string): string {
  // Remove all non-numeric characters except +
  let normalized = phone.replace(/[^\d+]/g, "")

  // Remove leading + if present
  if (normalized.startsWith("+")) {
    normalized = normalized.substring(1)
  }

  // If it's a 10-digit Colombian number (without country code), add 57
  if (normalized.length === 10 && normalized.startsWith("3")) {
    normalized = "57" + normalized
  }

  return normalized
}

// Helper function to validate phone number format
function isValidPhoneNumber(phone: string): boolean {
  const normalized = normalizePhoneNumber(phone)
  // Must be numeric and have reasonable length (10-15 digits)
  return /^\d{10,15}$/.test(normalized)
}

// Type for parsed contact row
type ParsedContactRow = {
  rowNumber: number
  phoneNumber: string
  normalizedPhoneNumber: string
  displayName?: string
  lastKnownAddress?: string
  isValid: boolean
  errors: string[]
}

// Preview contacts import - parse and validate CSV content
export const previewContactsImport = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
  },
  handler: async (ctx, args) => {
    const lines = args.csvContent.split("\n").filter((line) => line.trim())

    if (lines.length < 2) {
      return {
        success: false,
        error:
          "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos",
        preview: null,
      }
    }

    // Parse header row
    const headerLine = lines[0]
    if (!headerLine) {
      return {
        success: false,
        error: "El archivo CSV no tiene encabezados válidos",
        preview: null,
      }
    }
    const headers = headerLine
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/"/g, ""))

    // Validate required columns (prioritize Spanish names)
    const phoneNumberIndex = headers.findIndex(
      (h) => h === "telefono" || h === "teléfono" || h === "phone_number"
    )

    if (phoneNumberIndex === -1) {
      return {
        success: false,
        error:
          "Columna requerida 'telefono' no encontrada. Asegúrate de que el archivo tenga la columna telefono.",
        preview: null,
      }
    }

    // Find optional columns (prioritize Spanish names)
    const displayNameIndex = headers.findIndex(
      (h) => h === "nombre" || h === "name" || h === "display_name"
    )
    const addressIndex = headers.findIndex(
      (h) =>
        h === "direccion" ||
        h === "dirección" ||
        h === "address" ||
        h === "last_known_address"
    )

    // Parse data rows
    const parsedRows: ParsedContactRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim()
      if (!line) continue

      // Parse CSV line (handle quoted values)
      const values = parseCSVLine(line)

      const phoneNumber =
        values[phoneNumberIndex]?.trim().replace(/"/g, "") || ""
      const displayName =
        displayNameIndex >= 0
          ? values[displayNameIndex]?.trim().replace(/"/g, "") || undefined
          : undefined
      const lastKnownAddress =
        addressIndex >= 0
          ? values[addressIndex]?.trim().replace(/"/g, "") || undefined
          : undefined

      const errors: string[] = []

      // Validate phone number
      if (!phoneNumber) {
        errors.push("Número de teléfono es requerido")
      } else if (!isValidPhoneNumber(phoneNumber)) {
        errors.push(
          `Formato de teléfono inválido: "${phoneNumber}". Debe tener entre 10-15 dígitos.`
        )
      }

      const normalizedPhoneNumber = phoneNumber
        ? normalizePhoneNumber(phoneNumber)
        : ""

      parsedRows.push({
        rowNumber: i + 1,
        phoneNumber,
        normalizedPhoneNumber,
        displayName,
        lastKnownAddress,
        isValid: errors.length === 0,
        errors,
      })
    }

    // Check for duplicates within the CSV
    const phoneNumberCounts = new Map<string, number[]>()
    for (const row of parsedRows) {
      if (row.normalizedPhoneNumber) {
        const existing = phoneNumberCounts.get(row.normalizedPhoneNumber) || []
        existing.push(row.rowNumber)
        phoneNumberCounts.set(row.normalizedPhoneNumber, existing)
      }
    }

    // Mark duplicates within CSV
    for (const row of parsedRows) {
      const occurrences = phoneNumberCounts.get(row.normalizedPhoneNumber) || []
      if (occurrences.length > 1 && row.isValid) {
        row.errors.push(
          `Número duplicado en el archivo (filas: ${occurrences.join(", ")})`
        )
        row.isValid = false
      }
    }

    // Check for existing contacts in database
    const existingContacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingPhoneNumbers = new Set(
      existingContacts.map((c) => normalizePhoneNumber(c.phoneNumber))
    )

    // Categorize rows
    const validRows = parsedRows.filter((r) => r.isValid)
    const invalidRows = parsedRows.filter((r) => !r.isValid)
    const newContacts = validRows.filter(
      (r) => !existingPhoneNumbers.has(r.normalizedPhoneNumber)
    )
    const duplicateContacts = validRows.filter((r) =>
      existingPhoneNumbers.has(r.normalizedPhoneNumber)
    )

    return {
      success: true,
      error: null,
      preview: {
        totalRows: parsedRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        newContacts: newContacts.length,
        duplicateContacts: duplicateContacts.length,
        rows: parsedRows.slice(0, 100), // Limit preview to first 100 rows
        errors: invalidRows.map((r) => ({
          row: r.rowNumber,
          errors: r.errors,
        })),
      },
    }
  },
})

// Import contacts from CSV
export const importContacts = authMutation({
  args: {
    organizationId: v.string(),
    csvContent: v.string(),
    conflictResolution: v.union(v.literal("skip"), v.literal("update")),
  },
  handler: async (ctx, args) => {
    const lines = args.csvContent.split("\n").filter((line) => line.trim())

    if (lines.length < 2) {
      return {
        success: false,
        error:
          "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos",
        imported: 0,
        skipped: 0,
        updated: 0,
        errors: [],
      }
    }

    // Parse header row
    const headerLine = lines[0]
    if (!headerLine) {
      return {
        success: false,
        error: "El archivo CSV no tiene encabezados válidos",
        imported: 0,
        skipped: 0,
        updated: 0,
        errors: [],
      }
    }
    const headers = headerLine
      .split(",")
      .map((h) => h.trim().toLowerCase().replace(/"/g, ""))

    // Find column indexes (prioritize Spanish names)
    const phoneNumberIndex = headers.findIndex(
      (h) => h === "telefono" || h === "teléfono" || h === "phone_number"
    )
    const displayNameIndex = headers.findIndex(
      (h) => h === "nombre" || h === "name" || h === "display_name"
    )
    const addressIndex = headers.findIndex(
      (h) =>
        h === "direccion" ||
        h === "dirección" ||
        h === "address" ||
        h === "last_known_address"
    )

    if (phoneNumberIndex === -1) {
      return {
        success: false,
        error: "Columna requerida 'telefono' no encontrada",
        imported: 0,
        skipped: 0,
        updated: 0,
        errors: [],
      }
    }

    // Get existing contacts
    const existingContacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    const existingContactsByPhone = new Map(
      existingContacts.map((c) => [normalizePhoneNumber(c.phoneNumber), c])
    )

    let imported = 0
    let skipped = 0
    let updated = 0
    const errors: { row: number; error: string }[] = []
    const processedPhones = new Set<string>()

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim()
      if (!line) continue

      const values = parseCSVLine(line)
      const phoneNumber =
        values[phoneNumberIndex]?.trim().replace(/"/g, "") || ""

      if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        errors.push({
          row: i + 1,
          error: `Número de teléfono inválido: "${phoneNumber}"`,
        })
        continue
      }

      const normalizedPhone = normalizePhoneNumber(phoneNumber)

      // Skip duplicates within the same import
      if (processedPhones.has(normalizedPhone)) {
        skipped++
        continue
      }
      processedPhones.add(normalizedPhone)

      const displayName =
        displayNameIndex >= 0
          ? values[displayNameIndex]?.trim().replace(/"/g, "") || undefined
          : undefined
      const lastKnownAddress =
        addressIndex >= 0
          ? values[addressIndex]?.trim().replace(/"/g, "") || undefined
          : undefined

      const existingContact = existingContactsByPhone.get(normalizedPhone)

      if (existingContact) {
        if (args.conflictResolution === "update") {
          // Update existing contact
          await ctx.db.patch(existingContact._id, {
            ...(displayName && { displayName }),
            ...(lastKnownAddress && { lastKnownAddress }),
          })
          updated++
        } else {
          // Skip existing contact
          skipped++
        }
      } else {
        // Create new contact
        const createdContactId = await ctx.db.insert("contacts", {
          phoneNumber: normalizedPhone,
          displayName,
          lastKnownAddress,
          organizationId: args.organizationId,
        })
        const createdContact = await ctx.db.get(createdContactId)
        if (createdContact) {
          await aggregateContactsByOrganization.insertIfDoesNotExist(
            ctx,
            createdContact
          )
        }
        imported++
      }
    }

    return {
      success: true,
      error: null,
      imported,
      skipped,
      updated,
      errors,
    }
  },
})

// Helper function to parse CSV line handling quoted values
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"'
        i++
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

// Export all contacts for CSV export
export const getAllForExport = authQuery({
  args: {
    organizationId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get all contacts for the organization
    const allContacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    // Add computed fields for each contact
    const contactsWithDetails = await Promise.all(
      allContacts.map(async (contact) => {
        const orderCount = await ctx.db
          .query("orders")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .collect()
          .then((orders) => orders.length)

        const conversationCount = await ctx.db
          .query("conversations")
          .withIndex("by_contact_id", (q) => q.eq("contactId", contact._id))
          .collect()
          .then((conversations) => conversations.length)

        return {
          _id: contact._id,
          displayName: contact.displayName,
          phoneNumber: contact.phoneNumber,
          lastKnownAddress: contact.lastKnownAddress,
          isBlocked: contact.isBlocked,
          lastMessageAt: contact.lastMessageAt,
          _creationTime: contact._creationTime,
          orderCount,
          conversationCount,
        }
      })
    )

    return contactsWithDetails
  },
})

// Import contacts from JSON array and return IDs (for campaign selection)
export const importContactsBatch = authMutation({
  args: {
    organizationId: v.string(),
    contacts: v.array(
      v.object({
        phoneNumber: v.string(),
        displayName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { contacts, organizationId } = args
    const contactIds: string[] = []
    const processedPhones = new Set<string>()

    // Get existing contacts
    const existingContacts = await ctx.db
      .query("contacts")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    const existingContactsByPhone = new Map(
      existingContacts.map((c) => [normalizePhoneNumber(c.phoneNumber), c])
    )

    for (const contact of contacts) {
      if (!contact.phoneNumber) continue

      const normalizedPhone = normalizePhoneNumber(contact.phoneNumber)

      if (!isValidPhoneNumber(normalizedPhone)) {
        continue
      }

      if (processedPhones.has(normalizedPhone)) continue
      processedPhones.add(normalizedPhone)

      const existing = existingContactsByPhone.get(normalizedPhone)

      if (existing) {
        // Update name if provided
        if (
          contact.displayName &&
          contact.displayName !== existing.displayName
        ) {
          await ctx.db.patch(existing._id, { displayName: contact.displayName })
        }
        contactIds.push(existing._id)
      } else {
        // Create new
        const newId = await ctx.db.insert("contacts", {
          organizationId,
          phoneNumber: normalizedPhone,
          displayName: contact.displayName,
        })
        const createdContact = await ctx.db.get(newId)
        if (createdContact) {
          await aggregateContactsByOrganization.insertIfDoesNotExist(
            ctx,
            createdContact
          )
        }
        contactIds.push(newId)
      }
    }

    return contactIds
  },
})
