import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { internalMutation, mutation } from "./_generated/server"

/**
 * Seed function to create test data for development
 *
 * Usage from Convex dashboard or CLI:
 * npx convex run seed:createTestData --args '{"organizationId": "org_xxx"}'
 *
 * Or with WhatsApp config:
 * npx convex run seed:createTestData --args '{"organizationId": "org_xxx", "whatsappPhoneNumberId": "123456", "whatsappAccessToken": "EAAf..."}'
 */
export const createTestData = internalMutation({
  args: {
    organizationId: v.string(),
    // Optional: WhatsApp configuration
    whatsappPhoneNumberId: v.optional(v.string()),
    whatsappAccessToken: v.optional(v.string()),
    whatsappPhoneNumber: v.optional(v.string()),
    // Optional: Clear existing data first
    clearExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { organizationId, clearExisting } = args

    // Clear existing data if requested
    if (clearExisting) {
      await clearOrganizationData(ctx, organizationId)
    }

    // 1. Create Restaurant Location
    const locationId = await ctx.db.insert("restaurantLocations", {
      name: "Sede Principal - Test",
      code: "MAIN",
      organizationId,
      address: "Calle 45 #23-15, Bucaramanga",
      coordinates: {
        latitude: 7.1193,
        longitude: -73.1227,
      },
      available: true,
      color: "#3B82F6",
      priority: 1,
      openingHours: [
        {
          day: "monday",
          ranges: [{ open: "10:00", close: "22:00" }],
        },
        {
          day: "tuesday",
          ranges: [{ open: "10:00", close: "22:00" }],
        },
        {
          day: "wednesday",
          ranges: [{ open: "10:00", close: "22:00" }],
        },
        {
          day: "thursday",
          ranges: [{ open: "10:00", close: "22:00" }],
        },
        {
          day: "friday",
          ranges: [{ open: "10:00", close: "23:00" }],
        },
        {
          day: "saturday",
          ranges: [{ open: "11:00", close: "23:00" }],
        },
        {
          day: "sunday",
          ranges: [{ open: "11:00", close: "21:00" }],
        },
      ],
    })

    // 2. Create Menu Categories
    const pizzasCategoryId = await ctx.db.insert("menuProductCategories", {
      name: "Pizzas",
      organizationId,
    })

    const bebidasCategoryId = await ctx.db.insert("menuProductCategories", {
      name: "Bebidas",
      organizationId,
    })

    const complementosCategoryId = await ctx.db.insert(
      "menuProductCategories",
      {
        name: "Complementos",
        organizationId,
      }
    )

    const postresCategoryId = await ctx.db.insert("menuProductCategories", {
      name: "Postres",
      organizationId,
    })

    // 3. Create Sizes
    const personalSizeId = await ctx.db.insert("sizes", {
      name: "Personal",
      organizationId,
    })

    const medianaSizeId = await ctx.db.insert("sizes", {
      name: "Mediana",
      organizationId,
    })

    const familiarSizeId = await ctx.db.insert("sizes", {
      name: "Familiar",
      organizationId,
    })

    // 4. Create Menu Products
    const products: Array<{
      name: string
      description: string
      price: number
      categoryId: Id<"menuProductCategories">
      sizeId?: Id<"sizes">
      standAlone: boolean
      combinableHalf: boolean
      imageUrl?: string
    }> = [
      // Pizzas - Personal
      {
        name: "Pizza Hawaiana Personal",
        description: "Deliciosa pizza con jamón y piña",
        price: 18000,
        categoryId: pizzasCategoryId,
        sizeId: personalSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
      },
      {
        name: "Pizza Pepperoni Personal",
        description: "Clásica pizza con pepperoni",
        price: 20000,
        categoryId: pizzasCategoryId,
        sizeId: personalSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400",
      },
      {
        name: "Pizza Margarita Personal",
        description: "Pizza tradicional con tomate y albahaca",
        price: 16000,
        categoryId: pizzasCategoryId,
        sizeId: personalSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400",
      },
      // Pizzas - Mediana
      {
        name: "Pizza Hawaiana Mediana",
        description: "Deliciosa pizza con jamón y piña",
        price: 32000,
        categoryId: pizzasCategoryId,
        sizeId: medianaSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
      },
      {
        name: "Pizza Pepperoni Mediana",
        description: "Clásica pizza con pepperoni",
        price: 35000,
        categoryId: pizzasCategoryId,
        sizeId: medianaSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400",
      },
      // Pizzas - Familiar
      {
        name: "Pizza Hawaiana Familiar",
        description: "Deliciosa pizza con jamón y piña para toda la familia",
        price: 45000,
        categoryId: pizzasCategoryId,
        sizeId: familiarSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
      },
      {
        name: "Pizza Pepperoni Familiar",
        description: "Clásica pizza con pepperoni para toda la familia",
        price: 48000,
        categoryId: pizzasCategoryId,
        sizeId: familiarSizeId,
        standAlone: true,
        combinableHalf: true,
        imageUrl:
          "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400",
      },
      // Bebidas
      {
        name: "Coca-Cola 350ml",
        description: "Bebida gaseosa",
        price: 4000,
        categoryId: bebidasCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400",
      },
      {
        name: "Sprite 350ml",
        description: "Bebida gaseosa sabor limón",
        price: 4000,
        categoryId: bebidasCategoryId,
        standAlone: true,
        combinableHalf: false,
      },
      {
        name: "Agua Cristal 600ml",
        description: "Agua natural",
        price: 3000,
        categoryId: bebidasCategoryId,
        standAlone: true,
        combinableHalf: false,
      },
      {
        name: "Limonada Natural",
        description: "Limonada preparada con limones frescos",
        price: 6000,
        categoryId: bebidasCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=400",
      },
      // Complementos
      {
        name: "Palitos de Ajo",
        description: "6 palitos de pan con ajo y queso",
        price: 12000,
        categoryId: complementosCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?w=400",
      },
      {
        name: "Alitas BBQ x6",
        description: "6 alitas de pollo en salsa BBQ",
        price: 18000,
        categoryId: complementosCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1608039755401-742074f0548d?w=400",
      },
      {
        name: "Papas a la Francesa",
        description: "Porción de papas fritas crujientes",
        price: 8000,
        categoryId: complementosCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400",
      },
      // Postres
      {
        name: "Brownie con Helado",
        description: "Brownie de chocolate con helado de vainilla",
        price: 12000,
        categoryId: postresCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1564355808539-22fda35bed7e?w=400",
      },
      {
        name: "Cheesecake",
        description: "Porción de cheesecake con frutos rojos",
        price: 10000,
        categoryId: postresCategoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl:
          "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?w=400",
      },
      // Adicionales (no standalone)
      {
        name: "Extra Queso",
        description: "Porción adicional de queso mozzarella",
        price: 5000,
        categoryId: pizzasCategoryId,
        standAlone: false,
        combinableHalf: false,
      },
      {
        name: "Extra Pepperoni",
        description: "Porción adicional de pepperoni",
        price: 6000,
        categoryId: pizzasCategoryId,
        standAlone: false,
        combinableHalf: false,
      },
    ]

    const productIds: Id<"menuProducts">[] = []
    for (const product of products) {
      const productId = await ctx.db.insert("menuProducts", {
        name: product.name,
        nameNormalized: normalizeText(product.name),
        description: product.description,
        price: product.price,
        menuProductCategoryId: product.categoryId,
        sizeId: product.sizeId,
        standAlone: product.standAlone,
        combinableHalf: product.combinableHalf,
        imageUrl: product.imageUrl,
        organizationId,
      })
      productIds.push(productId)

      // Create availability for the location
      await ctx.db.insert("menuProductAvailability", {
        menuProductId: productId,
        restaurantLocationId: locationId,
        available: true,
        organizationId,
      })
    }

    // 5. Create Delivery Area
    await ctx.db.insert("deliveryAreas", {
      name: "Zona Centro",
      description: "Área de entrega en el centro de la ciudad",
      organizationId,
      restaurantLocationId: locationId,
      coordinates: [
        { lat: 7.13, lng: -73.13 },
        { lat: 7.13, lng: -73.11 },
        { lat: 7.11, lng: -73.11 },
        { lat: 7.11, lng: -73.13 },
      ],
      isActive: true,
      deliveryFee: 5000,
      minimumOrder: 20000,
      estimatedDeliveryTime: "30-45 min",
    })

    await ctx.db.insert("deliveryAreas", {
      name: "Zona Norte",
      description: "Área de entrega en el norte de la ciudad",
      organizationId,
      restaurantLocationId: locationId,
      coordinates: [
        { lat: 7.15, lng: -73.13 },
        { lat: 7.15, lng: -73.11 },
        { lat: 7.13, lng: -73.11 },
        { lat: 7.13, lng: -73.13 },
      ],
      isActive: true,
      deliveryFee: 7000,
      minimumOrder: 25000,
      estimatedDeliveryTime: "40-55 min",
    })

    // 6. Create Restaurant Configuration
    await ctx.db.insert("restaurantConfiguration", {
      organizationId,
      minAdvanceMinutes: 30,
      maxAdvanceDays: 7,
      orderModificationBufferMinutes: 5,
      conversationResolutionBufferMinutes: 30,
      acceptCash: true,
      acceptCard: true,
      acceptPaymentLink: true,
      acceptBankTransfer: false,
      enableDelivery: true,
      enablePickup: true,
      enableElectronicInvoice: false,
      restaurantName: "Pizzería Test",
      restaurantPhone: "573001234567",
      restaurantAddress: "Calle 45 #23-15, Bucaramanga",
    })

    // 7. Create Agent Configuration
    await ctx.db.insert("agentConfiguration", {
      organizationId,
      brandVoice:
        "Somos una pizzería familiar con más de 10 años de experiencia. Nuestro tono es amigable, cercano y profesional.",
      restaurantContext:
        "Pizzería especializada en pizzas artesanales con ingredientes frescos. Ofrecemos delivery y pickup.",
      customGreeting:
        "¡Hola! 🍕 Bienvenido a Pizzería Test. ¿En qué puedo ayudarte hoy?",
      businessRules:
        "- Pedido mínimo para delivery: $20.000\n- Tiempo de entrega: 30-45 minutos\n- Aceptamos efectivo y tarjeta",
      supportAgentModel: "grok-4-fast-no-reasoning",
      lastModified: Date.now(),
    })

    // 8. Create WhatsApp Configuration (if provided)
    if (args.whatsappPhoneNumberId && args.whatsappAccessToken) {
      await ctx.db.insert("whatsappConfigurations", {
        organizationId,
        provider: "meta",
        phoneNumberId: args.whatsappPhoneNumberId,
        accessToken: args.whatsappAccessToken,
        phoneNumber: args.whatsappPhoneNumber || "573001234567",
        isActive: true,
        displayName: "Línea Principal Test",
        restaurantLocationId: locationId,
        lastModified: Date.now(),
      })
    }

    // 9. Create a test contact
    const contactId = await ctx.db.insert("contacts", {
      phoneNumber: "573001234567",
      displayName: "Cliente Test",
      organizationId,
      lastMessageAt: Date.now(),
      isBlocked: false,
    })

    return {
      success: true,
      created: {
        locationId,
        categories: {
          pizzas: pizzasCategoryId,
          bebidas: bebidasCategoryId,
          complementos: complementosCategoryId,
          postres: postresCategoryId,
        },
        sizes: {
          personal: personalSizeId,
          mediana: medianaSizeId,
          familiar: familiarSizeId,
        },
        productsCount: productIds.length,
        contactId,
      },
    }
  },
})

/**
 * Clear all data for an organization
 */
export const clearOrganizationData = async (
  ctx: { db: any },
  organizationId: string
) => {
  const tables = [
    "menuProductAvailability",
    "menuProductOrderItems",
    "orderItems",
    "orders",
    "deliveryAreas",
    "menuProducts",
    "menuProductSubcategories",
    "menuProductCategories",
    "sizes",
    "restaurantLocations",
    "restaurantConfiguration",
    "agentConfiguration",
    "whatsappConfigurations",
    "contacts",
    "conversations",
  ]

  for (const tableName of tables) {
    const records = await ctx.db
      .query(tableName)
      .withIndex("by_organization_id", (q: any) =>
        q.eq("organizationId", organizationId)
      )
      .collect()

    for (const record of records) {
      await ctx.db.delete(record._id)
    }
  }
}

/**
 * Helper to normalize text for search
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
}

/**
 * Quick seed for just adding products to an existing organization
 */
export const addSampleProducts = internalMutation({
  args: {
    organizationId: v.string(),
    categoryId: v.id("menuProductCategories"),
    locationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    const { organizationId, categoryId, locationId } = args

    const sampleProducts = [
      {
        name: "Producto Test 1",
        description: "Descripción del producto test 1",
        price: 15000,
        imageUrl:
          "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400",
      },
      {
        name: "Producto Test 2",
        description: "Descripción del producto test 2",
        price: 20000,
        imageUrl:
          "https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400",
      },
      {
        name: "Producto Sin Imagen",
        description: "Este producto no tiene imagen configurada",
        price: 12000,
      },
    ]

    const productIds: Id<"menuProducts">[] = []

    for (const product of sampleProducts) {
      const productId = await ctx.db.insert("menuProducts", {
        name: product.name,
        nameNormalized: normalizeText(product.name),
        description: product.description,
        price: product.price,
        menuProductCategoryId: categoryId,
        standAlone: true,
        combinableHalf: false,
        imageUrl: product.imageUrl,
        organizationId,
      })
      productIds.push(productId)

      if (locationId) {
        await ctx.db.insert("menuProductAvailability", {
          menuProductId: productId,
          restaurantLocationId: locationId,
          available: true,
          organizationId,
        })
      }
    }

    return { productIds }
  },
})

/**
 * Create a Gupshup WhatsApp configuration
 *
 * Usage:
 * npx convex run seed:createGupshupConfig --args '{"organizationId": "org_xxx", "gupshupApiKey": "sk_...", "gupshupAppName": "ClonAIDev", "phoneNumber": "573012356784"}'
 */
export const createGupshupConfig = internalMutation({
  args: {
    organizationId: v.string(),
    gupshupApiKey: v.string(),
    gupshupAppName: v.string(),
    gupshupClientSecret: v.optional(v.string()), // Added
    phoneNumber: v.string(),
    gupshupSourceNumber: v.optional(v.string()),
    displayName: v.optional(v.string()),
    restaurantLocationId: v.optional(v.id("restaurantLocations")),
  },
  handler: async (ctx, args) => {
    // Check if a Gupshup config already exists for this org + phone
    const existing = await ctx.db
      .query("whatsappConfigurations")
      .withIndex("by_organization_and_phone_number", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("phoneNumber", args.phoneNumber)
      )
      .first()

    if (existing) {
      console.log("⚠️ Configuration already exists, updating...")
      await ctx.db.patch(existing._id, {
        provider: "gupshup",
        gupshupApiKey: args.gupshupApiKey,
        gupshupAppName: args.gupshupAppName,
        gupshupClientSecret: args.gupshupClientSecret,
        gupshupSourceNumber: args.gupshupSourceNumber || args.phoneNumber,
        isActive: true,
        lastModified: Date.now(),
      })
      return existing._id
    }

    const configId = await ctx.db.insert("whatsappConfigurations", {
      organizationId: args.organizationId,
      provider: "gupshup",
      gupshupApiKey: args.gupshupApiKey,
      gupshupAppName: args.gupshupAppName,
      gupshupClientSecret: args.gupshupClientSecret,
      gupshupSourceNumber: args.gupshupSourceNumber || args.phoneNumber,
      phoneNumber: args.phoneNumber,
      displayName: args.displayName || `Gupshup - ${args.gupshupAppName}`,
      restaurantLocationId: args.restaurantLocationId,
      isActive: true,
      lastModified: Date.now(),
    })

    console.log(`✅ Gupshup configuration created: ${configId}`)
    return configId
  },
})

/**
 * Update a Gupshup configuration with V3 Partner API fields (appId and appToken)
 *
 * Usage:
 * npx convex run seed:updateGupshupConfigV3 '{"configId": "...", "gupshupAppId": "uuid", "gupshupAppToken": "sk_..."}'
 */
export const updateGupshupConfigV3 = mutation({
  args: {
    configId: v.id("whatsappConfigurations"),
    gupshupAppId: v.string(),
    gupshupAppToken: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId)
    if (!config) {
      throw new Error(`Configuration not found: ${args.configId}`)
    }

    await ctx.db.patch(args.configId, {
      gupshupAppId: args.gupshupAppId,
      gupshupAppToken: args.gupshupAppToken,
      lastModified: Date.now(),
    })

    console.log(`✅ Gupshup V3 fields updated for: ${args.configId}`)
    return args.configId
  },
})
