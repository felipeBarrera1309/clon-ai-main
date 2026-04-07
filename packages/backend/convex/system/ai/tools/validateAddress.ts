import z from "zod"
import { internal } from "../../../_generated/api"
import {
  validateAddressCoordinates,
  validateDeliveryCoordinates,
} from "../../../lib/addressValidationHelpers"
import type { Coordinates } from "../../../lib/geocoding"
import { isRestaurantOpen } from "../../../lib/scheduleUtils"
import { createTaggedTool } from "./toolWrapper"

/**
 * Extrae información de municipio/ciudad de una dirección
 * Sin hardcodear nombres específicos de municipios
 */
function extractLocationInfo(address: string): {
  municipality?: string
  inferred: boolean
} {
  const normalizedAddress = address.toLowerCase().trim()

  // Patrones comunes de direcciones colombianas sin hardcodear municipios específicos
  // Busca indicadores de ubicación como "barrio", "conjunto", "urbanización", etc.
  const specificPatterns = [
    /\b(calle|carrera|avenida|diagonal|transversal|cll|cra|av|diag|tv|transv|cl|cr|dg|tr)\b/i,
    /#\s*\d+/i, // El símbolo "#" seguido de números
    /\b(nro|num|numero|no)\.?\s*\d+/i,
    /\b(torre|edificio|ed|piso|apto|apartamento|casa|interior|int|bloque|bl|mz|manzana)\b/i,
    /\b(barrio|urbanización|urb|sector|zona|localidad|conjunto|municipio|ciudad|vereda)\b/i,
  ]

  // Si la dirección contiene patrones que sugieren una ubicación específica (calle, número, edificio, etc.)
  const hasSpecificIndicator = specificPatterns.some((pattern) =>
    pattern.test(normalizedAddress)
  )

  if (hasSpecificIndicator) {
    console.log(
      `[LOCATION_INFERENCE] 📍 Dirección contiene indicadores específicos o descriptivos`
    )
    return { inferred: true }
  }

  // Si no se detectan patrones específicos, no inferir municipio
  console.log(
    `[LOCATION_INFERENCE] 📍 Dirección genérica sin indicadores específicos de municipio`
  )
  return { inferred: false }
}

function getDistanceFromLatLonInKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371 // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1)
  const dLon = deg2rad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const d = R * c // Distance in km
  return d
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180)
}

export const validateAddress = createTaggedTool({
  description:
    "Valida cobertura y condiciones de entrega para una dirección, incluyendo disponibilidad del restaurante y datos de soporte para el pedido. ADVERTENCIA: Solo usa esta herramienta si el Protocolo de Conversación indica que delivery está disponible. Para pedidos de recoger en restaurante (pickup) NO uses esta herramienta. Retorna resultado de cobertura, costos y metadatos operativos de ubicación. Usa esta herramienta con una dirección de texto o con coordenadas (latitud/longitud) si el cliente compartió su ubicación.",
  args: z.object({
    address: z
      .string()
      .optional()
      .describe(
        "La dirección completa del cliente (requerida si no se proporcionan coordenadas)."
      ),
    latitude: z
      .number()
      .optional()
      .describe(
        "Latitud de la ubicación (si el cliente compartió su ubicación)"
      ),
    longitude: z
      .number()
      .optional()
      .describe(
        "Longitud de la ubicación (si el cliente compartió su ubicación)"
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (!ctx.threadId) {
      return "Error: Falta el ID del hilo"
    }

    // Validate input - need either address OR coordinates
    const hasCoordinates =
      args.latitude !== undefined && args.longitude !== undefined
    const hasAddress = args.address !== undefined && args.address.trim() !== ""

    if (!hasCoordinates && !hasAddress) {
      return "Error: Debes proporcionar una dirección o las coordenadas de ubicación"
    }

    try {
      // Get the conversation to extract organization ID
      const conversation = await ctx.runQuery(
        internal.system.conversations.getByThreadId,
        { threadId: ctx.threadId }
      )

      if (!conversation) {
        return "Error: Conversación no encontrada"
      }

      let result
      let displayAddress: string
      let locationInfo: { municipality?: string; inferred: boolean } = {
        inferred: true,
      }

      // Option 1: Use provided coordinates directly
      if (hasCoordinates) {
        const coordinates: Coordinates = {
          lat: args.latitude!,
          lng: args.longitude!,
        }
        const formattedAddress = `Ubicación compartida: ${args.latitude!.toFixed(6)}, ${args.longitude!.toFixed(6)}`
        displayAddress = "tu ubicación compartida"

        console.log(
          `[VALIDATE_ADDRESS] 📍 Usando coordenadas directas: (${args.latitude}, ${args.longitude})`
        )

        result = await validateDeliveryCoordinates(ctx, {
          organizationId: conversation.organizationId,
          coordinates,
          formattedAddress,
        })
      } else {
        // Option 2: Valida address string (classic flow)
        if (!args.address) throw new Error("Address required if no coordinates") // Should be caught by earlier check
        displayAddress = args.address

        // Extract location information from address
        locationInfo = extractLocationInfo(args.address)
        if (locationInfo.municipality) {
          console.log(
            `[VALIDATE_ADDRESS] 📍 Municipio inferido: ${locationInfo.municipality}`
          )
        }

        console.log(
          `[VALIDATE_ADDRESS] 🔍 Validando dirección: "${args.address}" para organización: ${conversation.organizationId}`
        )

        result = await validateAddressCoordinates(ctx, {
          organizationId: conversation.organizationId,
          address: args.address,
        })
      }

      console.log(`[VALIDATE_ADDRESS] 📊 Resultado de validación:`, {
        isValid: result.isValid,
        hasDeliveryArea: !!result.deliveryArea,
        coordinates: result.coordinates,
        formattedAddress: result.formattedAddress,
        error: result.error,
      })

      if (result.isValid && result.deliveryArea) {
        const area = result.deliveryArea
        let response = `✅ ¡Perfecto! Sí hacemos delivery a ${displayAddress!}.\n\n`
        response += `📍 Zona de entrega: ${area.name}\n`

        // Validate and display delivery fee (ensure it's reasonable)
        if (area.deliveryFee && area.deliveryFee > 0) {
          response += `💰 Costo de envío: $${area.deliveryFee.toLocaleString()}\n`
          console.log(
            `[VALIDATE_ADDRESS] ✅ Tarifa de domicilio válida: $${area.deliveryFee}`
          )
        } else if (area.deliveryFee === 0) {
          console.warn(
            `[VALIDATE_ADDRESS] ⚠️ ADVERTENCIA: Área ${area.name} tiene costo de envío $0 - puede ser configuración incorrecta`
          )
          response += `💰 Costo de envío: $0 (gratuito)\n`
        } else {
          // If no delivery fee is set, assume it's free or use a default
          console.error(
            `[VALIDATE_ADDRESS] ❌ ERROR: Área ${area.name} no tiene costo de envío configurado`
          )
          response += `💰 Costo de envío: No configurado\n`
        }

        if (area.minimumOrder && area.minimumOrder > 0) {
          response += `📦 Pedido mínimo: $${area.minimumOrder.toLocaleString()}\n`
        }

        if (area.estimatedDeliveryTime) {
          response += `⏱️ Tiempo estimado: ${area.estimatedDeliveryTime}\n`
        }

        // Log complete area information for debugging
        console.log(
          `[VALIDATE_ADDRESS] 📊 Información completa del área seleccionada:`,
          {
            areaId: area.id,
            areaName: area.name,
            restaurantLocationId: area.restaurantLocationId,
            restaurantLocationName: area.restaurantLocationName,
            deliveryFee: area.deliveryFee,
            minimumOrder: area.minimumOrder,
            estimatedDeliveryTime: area.estimatedDeliveryTime,
            priority: area.priority,
          }
        )

        // Add restaurant schedule information
        if (result.deliveryArea?.restaurantLocationId) {
          // Get restaurant location data from the delivery area result
          const restaurantLocation = await ctx.runQuery(
            internal.system.addressValidation.getRestaurantLocationById,
            {
              restaurantLocationId: result.deliveryArea
                .restaurantLocationId as any,
            }
          )

          if (restaurantLocation) {
            const availability = isRestaurantOpen(restaurantLocation)

            if (availability.isOpen) {
              response += `\n🕒 ✅ El restaurante está abierto ahora. ${availability.message}\n`
            } else {
              response += `\n🕒 ❌ Actualmente el restaurante está cerrado.\n`

              if (availability.nextOpenTime) {
                const nextOpen = availability.nextOpenTime
                const currentTime = new Date()
                const isToday =
                  nextOpen.toLocaleDateString("es-CO") ===
                  currentTime.toLocaleDateString("es-CO")

                if (isToday) {
                  const timeStr = nextOpen.toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                  response += `📅 Abrimos hoy a las ${timeStr}\n`
                } else {
                  const dayName = nextOpen.toLocaleDateString("es-CO", {
                    weekday: "long",
                  })
                  const timeStr = nextOpen.toLocaleTimeString("es-CO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                  response += `📅 Abrimos ${dayName} a las ${timeStr}\n`
                }

                response += `\n💡 Puedes hacer tu pedido programado y lo prepararemos cuando abramos.\n`
              }
            }
          }
        }

        // Include restaurant location ID, delivery fee, and coordinates for order creation (hidden from customer)
        const coordsStr = result.coordinates
          ? `, coordinates=${JSON.stringify(result.coordinates)}`
          : ""
        response += `\n\n[INTERNAL_INFO: restaurantLocationId=${area.restaurantLocationId}, deliveryFee=${area.deliveryFee || 0}${coordsStr}]`

        return response
      } else {
        const isGeneric = !locationInfo.inferred
        let response = `❌ Lo siento, no pudimos confirmar cobertura para "${result.formattedAddress || args.address}".\n\n`

        if (isGeneric) {
          // El usuario proporcionó algo muy general (solo ciudad o barrio sin calle)
          response += `⚠️ NOTA: La dirección parece estar incompleta o ser muy general (ej: solo una ciudad o barrio sin detalles de calle/número). Por favor, asegúrate de proporcionar la dirección completa para una validación precisa.\n\n`
        }

        response += `Actualmente no tenemos cobertura de entrega en esta zona específica.`

        // Check if pickup is enabled to offer it as an alternative
        try {
          const config = await ctx.runQuery(
            internal.private.config.getRestaurantConfigInternal,
            { organizationId: conversation.organizationId }
          )

          // Default to true if not set (system default)
          const pickupEnabled = config?.enablePickup ?? true

          if (pickupEnabled) {
            let pickupMessage = ""

            // Try to find restaurant locations to customize the message
            try {
              const locations = await ctx.runQuery(
                internal.system.restaurantLocations.getAllByOrganization,
                { organizationId: conversation.organizationId }
              )

              if (locations && locations.length > 1 && result.coordinates) {
                // MULTIPLE LOCATIONS: Calculate nearest and show details
                let minDistance = Infinity
                let nearestLocation = null

                const userLat = result.coordinates.lat
                const userLng = result.coordinates.lng

                for (const loc of locations) {
                  if (loc.coordinates && loc.available) {
                    const dist = getDistanceFromLatLonInKm(
                      userLat,
                      userLng,
                      loc.coordinates.latitude,
                      loc.coordinates.longitude
                    )
                    if (dist < minDistance) {
                      minDistance = dist
                      nearestLocation = loc
                    }
                  }
                }

                if (nearestLocation) {
                  const distStr =
                    minDistance < 1
                      ? `${(minDistance * 1000).toFixed(0)}m`
                      : `${minDistance.toFixed(1)}km`

                  pickupMessage = `\n\n💡 Si lo prefieres, puedes recoger tu pedido en nuestra sede más cercana para ti, *${nearestLocation.name}* (a ${distStr}).`
                } else {
                  // Fallback if no nearest location found (e.g. no coords)
                  pickupMessage = `\n\n💡 Si lo prefieres, puedes recoger tu pedido en nuestra sede.`
                }
              } else {
                // SINGLE LOCATION (or unknown/no coordinates): Generic message
                pickupMessage = `\n\n💡 Si lo prefieres, puedes recoger tu pedido en nuestra sede.`
              }
            } catch (locError) {
              console.error(
                "[VALIDATE_ADDRESS] Error fetching locations:",
                locError
              )
              // Fallback to generic message on error
              pickupMessage = `\n\n💡 Si lo prefieres, puedes recoger tu pedido en nuestra sede.`
            }

            response += pickupMessage
          } else {
            response += `\n\n💡 ¿Te gustaría que te conecte con un operador para más información?`
          }
        } catch (error) {
          console.error(
            "[VALIDATE_ADDRESS] Error checking pickup configuration:",
            error
          )
          response += `\n\n💡 ¿Te gustaría que te conecte con un operador para más información?`
        }

        return response
      }
    } catch (error) {
      console.error("Error al validar dirección:", error)
      return "Lo siento, hubo un problema validando la dirección. Por favor intenta de nuevo o contacta a nuestro soporte."
    }
  },
})
