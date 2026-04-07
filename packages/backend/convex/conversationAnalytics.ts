import { v } from "convex/values"
import { internalQuery, query } from "./_generated/server"

/**
 * Calcula métricas de costos de conversaciones por organización
 *
 * Métricas incluidas:
 * 1. Suma total de costos
 * 2. Total de conversaciones
 * 3. Número de órdenes relacionadas
 * 4. Conversación más costosa
 * 5. Promedio de costo
 * 6. Tasa de conversión (órdenes/conversaciones)
 */
export const getConversationCostAnalytics = internalQuery({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.union(v.string(), v.number())), // YYYY-MM-DD o timestamp en milisegundos
    endDate: v.optional(v.union(v.string(), v.number())), // YYYY-MM-DD o timestamp en milisegundos
    timezoneOffset: v.optional(v.number()), // Offset en horas desde UTC (ej: -5 para Colombia)
  },
  handler: async (ctx, args) => {
    // Default: UTC-5 (hora de Colombia)
    const timezoneOffset =
      args.timezoneOffset !== undefined ? args.timezoneOffset : -5
    const offsetMs = timezoneOffset * 60 * 60 * 1000

    // Convertir fechas string a timestamps en la zona horaria especificada
    const startDateTimestamp = args.startDate
      ? typeof args.startDate === "string"
        ? (() => {
            // Parsear fecha y convertir a timestamp local
            const parts = args.startDate.split("-").map(Number)
            const year = parts[0] ?? 0
            const month = parts[1] ?? 1
            const day = parts[2] ?? 1
            // Crear fecha en UTC y ajustar por offset de zona horaria
            const utcDate = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
            // Restar el offset para obtener el momento correcto en UTC
            return utcDate - offsetMs
          })()
        : args.startDate
      : undefined

    const endDateTimestamp = args.endDate
      ? typeof args.endDate === "string"
        ? (() => {
            const parts = args.endDate.split("-").map(Number)
            const year = parts[0] ?? 0
            const month = parts[1] ?? 1
            const day = parts[2] ?? 1
            const utcDate = Date.UTC(year, month - 1, day, 23, 59, 59, 999)
            return utcDate - offsetMs
          })()
        : args.endDate
      : undefined

    // 1. Obtener todas las conversaciones de la organización
    const conversationsQuery = ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    const allConversations = await conversationsQuery.collect()

    // 2. Filtrar por rango de fechas si se proporcionan
    let filteredConversations = allConversations

    if (startDateTimestamp !== undefined || endDateTimestamp !== undefined) {
      filteredConversations = allConversations.filter((conv) => {
        const convTime = conv._creationTime

        if (startDateTimestamp !== undefined && convTime < startDateTimestamp) {
          return false
        }

        if (endDateTimestamp !== undefined && convTime > endDateTimestamp) {
          return false
        }

        return true
      })
    }

    // 3. Calcular total de conversaciones
    const totalConversations = filteredConversations.length

    // 4. Calcular suma total de costos
    let totalCost = 0
    let conversationsWithCost = 0

    for (const conv of filteredConversations) {
      if (conv.cost !== undefined && conv.cost > 0) {
        totalCost += conv.cost
        conversationsWithCost++
      }
    }

    // 5. Encontrar la conversación más costosa
    let mostExpensiveConversation = null
    let maxCost = 0

    for (const conv of filteredConversations) {
      if (conv.cost !== undefined && conv.cost > maxCost) {
        maxCost = conv.cost
        mostExpensiveConversation = {
          conversationId: conv._id,
          threadId: conv.threadId,
          cost: conv.cost,
          status: conv.status,
          createdAt: conv._creationTime,
          contactId: conv.contactId,
        }
      }
    }

    // 6. Calcular promedio de costo
    const averageCost =
      conversationsWithCost > 0 ? totalCost / conversationsWithCost : 0

    // 7. Obtener todas las órdenes relacionadas con estas conversaciones
    const conversationIds = filteredConversations.map((conv) => conv._id)

    let relatedOrders = []

    for (const convId of conversationIds) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", convId))
        .collect()

      relatedOrders.push(...orders)
    }

    // Si hay filtros de fecha, también filtrar las órdenes por fecha
    if (startDateTimestamp !== undefined || endDateTimestamp !== undefined) {
      relatedOrders = relatedOrders.filter((order) => {
        const orderTime = order._creationTime

        if (
          startDateTimestamp !== undefined &&
          orderTime < startDateTimestamp
        ) {
          return false
        }

        if (endDateTimestamp !== undefined && orderTime > endDateTimestamp) {
          return false
        }

        return true
      })
    }

    // 8. Contar número de órdenes
    const totalOrders = relatedOrders.length

    // 9. Calcular tasa de conversión (órdenes/conversaciones)
    const conversionRate =
      totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0

    // 10. Retornar todas las métricas
    return {
      organizationId: args.organizationId,
      dateRange: {
        startDate: args.startDate,
        endDate: args.endDate,
        timezoneOffset,
      },
      metrics: {
        totalCost: Number(totalCost.toFixed(4)), // Redondear a 4 decimales
        totalConversations,
        conversationsWithCost,
        averageCost: Number(averageCost.toFixed(4)),
        totalOrders,
        conversionRate: Number(conversionRate.toFixed(2)), // Porcentaje con 2 decimales
      },
      mostExpensiveConversation,
      summary: {
        conversationsWithoutCost: totalConversations - conversationsWithCost,
        conversationsWithOrders: new Set(
          relatedOrders.map((o) => o.conversationId)
        ).size,
        conversationsWithoutOrders:
          totalConversations -
          new Set(relatedOrders.map((o) => o.conversationId)).size,
      },
    }
  },
})

/**
 * Versión pública para testing desde el dashboard de Convex
 *
 * IMPORTANTE: Esta función NO valida autenticación ni permisos.
 * Solo debe usarse para testing. Para producción, crear una función
 * en /private o /public con validación de permisos adecuada.
 */
export const testConversationCostAnalytics = query({
  args: {
    organizationId: v.string(),
    startDate: v.optional(v.union(v.string(), v.number())), // YYYY-MM-DD o timestamp
    endDate: v.optional(v.union(v.string(), v.number())), // YYYY-MM-DD o timestamp
    timezoneOffset: v.optional(v.number()), // Offset en horas desde UTC (ej: -5 para Colombia)
  },
  handler: async (ctx, args) => {
    // Default: UTC-5 (hora de Colombia)
    const timezoneOffset =
      args.timezoneOffset !== undefined ? args.timezoneOffset : -5
    const offsetMs = timezoneOffset * 60 * 60 * 1000

    // Convertir fechas string a timestamps en la zona horaria especificada
    const startDateTimestamp = args.startDate
      ? typeof args.startDate === "string"
        ? (() => {
            const parts = args.startDate.split("-").map(Number)
            const year = parts[0] ?? 0
            const month = parts[1] ?? 1
            const day = parts[2] ?? 1
            const utcDate = Date.UTC(year, month - 1, day, 0, 0, 0, 0)
            return utcDate - offsetMs
          })()
        : args.startDate
      : undefined

    const endDateTimestamp = args.endDate
      ? typeof args.endDate === "string"
        ? (() => {
            const parts = args.endDate.split("-").map(Number)
            const year = parts[0] ?? 0
            const month = parts[1] ?? 1
            const day = parts[2] ?? 1
            const utcDate = Date.UTC(year, month - 1, day, 23, 59, 59, 999)
            return utcDate - offsetMs
          })()
        : args.endDate
      : undefined

    // Duplicar la lógica (no podemos llamar a internalQuery directamente desde query)
    const conversationsQuery = ctx.db
      .query("conversations")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )

    const allConversations = await conversationsQuery.collect()

    let filteredConversations = allConversations

    if (startDateTimestamp !== undefined || endDateTimestamp !== undefined) {
      filteredConversations = allConversations.filter((conv) => {
        const convTime = conv._creationTime
        if (startDateTimestamp !== undefined && convTime < startDateTimestamp) {
          return false
        }
        if (endDateTimestamp !== undefined && convTime > endDateTimestamp) {
          return false
        }
        return true
      })
    }

    const totalConversations = filteredConversations.length

    let totalCost = 0
    let conversationsWithCost = 0

    for (const conv of filteredConversations) {
      if (conv.cost !== undefined && conv.cost > 0) {
        totalCost += conv.cost
        conversationsWithCost++
      }
    }

    let mostExpensiveConversation = null
    let maxCost = 0

    for (const conv of filteredConversations) {
      if (conv.cost !== undefined && conv.cost > maxCost) {
        maxCost = conv.cost
        mostExpensiveConversation = {
          conversationId: conv._id,
          threadId: conv.threadId,
          cost: conv.cost,
          status: conv.status,
          createdAt: conv._creationTime,
          contactId: conv.contactId,
        }
      }
    }

    const averageCost =
      conversationsWithCost > 0 ? totalCost / conversationsWithCost : 0

    const conversationIds = filteredConversations.map((conv) => conv._id)

    let relatedOrders = []

    for (const convId of conversationIds) {
      const orders = await ctx.db
        .query("orders")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", convId))
        .collect()

      relatedOrders.push(...orders)
    }

    if (startDateTimestamp !== undefined || endDateTimestamp !== undefined) {
      relatedOrders = relatedOrders.filter((order) => {
        const orderTime = order._creationTime
        if (
          startDateTimestamp !== undefined &&
          orderTime < startDateTimestamp
        ) {
          return false
        }
        if (endDateTimestamp !== undefined && orderTime > endDateTimestamp) {
          return false
        }
        return true
      })
    }

    const totalOrders = relatedOrders.length

    const conversionRate =
      totalConversations > 0 ? (totalOrders / totalConversations) * 100 : 0

    return {
      organizationId: args.organizationId,
      dateRange: {
        startDate: args.startDate,
        endDate: args.endDate,
        timezoneOffset,
      },
      metrics: {
        totalCost: Number(totalCost.toFixed(4)),
        totalConversations,
        conversationsWithCost,
        averageCost: Number(averageCost.toFixed(4)),
        totalOrders,
        conversionRate: Number(conversionRate.toFixed(2)),
      },
      mostExpensiveConversation,
      summary: {
        conversationsWithoutCost: totalConversations - conversationsWithCost,
        conversationsWithOrders: new Set(
          relatedOrders.map((o) => o.conversationId)
        ).size,
        conversationsWithoutOrders:
          totalConversations -
          new Set(relatedOrders.map((o) => o.conversationId)).size,
      },
    }
  },
})
