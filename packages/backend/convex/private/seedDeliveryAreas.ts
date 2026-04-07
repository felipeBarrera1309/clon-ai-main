import { ConvexError, v } from "convex/values"
import { aggregateDeliveryAreasByOrganization } from "../deliveryAreasAggregate"
import { authMutation } from "../lib/helpers"

const defaultDeliveryAreas = [
  {
    name: "Zona Norte - Chapinero",
    description: "Incluye Chapinero, Zona Rosa y alrededores",
    coordinates: [
      { lat: 4.6897, lng: -74.0747 },
      { lat: 4.702, lng: -74.072 },
      { lat: 4.715, lng: -74.078 },
      { lat: 4.72, lng: -74.085 },
      { lat: 4.712, lng: -74.092 },
      { lat: 4.695, lng: -74.095 },
      { lat: 4.68, lng: -74.088 },
      { lat: 4.678, lng: -74.08 },
    ],
    isActive: true,
    deliveryFee: 5000,
    minimumOrder: 30000,
    estimatedDeliveryTime: "30-45 min",
  },
  {
    name: "Zona Centro - La Candelaria",
    description: "Centro histórico y zona financiera",
    coordinates: [
      { lat: 4.625, lng: -74.085 },
      { lat: 4.64, lng: -74.08 },
      { lat: 4.645, lng: -74.092 },
      { lat: 4.635, lng: -74.105 },
      { lat: 4.62, lng: -74.11 },
      { lat: 4.61, lng: -74.102 },
      { lat: 4.615, lng: -74.09 },
    ],
    isActive: true,
    deliveryFee: 3000,
    minimumOrder: 25000,
    estimatedDeliveryTime: "25-35 min",
  },
  {
    name: "Zona Sur - San Cristóbal",
    description: "Zona sur de Bogotá",
    coordinates: [
      { lat: 4.57, lng: -74.08 },
      { lat: 4.59, lng: -74.075 },
      { lat: 4.6, lng: -74.09 },
      { lat: 4.595, lng: -74.105 },
      { lat: 4.58, lng: -74.115 },
      { lat: 4.56, lng: -74.11 },
      { lat: 4.55, lng: -74.095 },
      { lat: 4.555, lng: -74.085 },
    ],
    isActive: true,
    deliveryFee: 6000,
    minimumOrder: 35000,
    estimatedDeliveryTime: "45-60 min",
  },
  {
    name: "Zona Oeste - Fontibón",
    description: "Zona occidental de Bogotá",
    coordinates: [
      { lat: 4.64, lng: -74.14 },
      { lat: 4.66, lng: -74.135 },
      { lat: 4.67, lng: -74.15 },
      { lat: 4.665, lng: -74.17 },
      { lat: 4.65, lng: -74.175 },
      { lat: 4.63, lng: -74.165 },
      { lat: 4.625, lng: -74.15 },
    ],
    isActive: false, // Initially disabled
    deliveryFee: 8000,
    minimumOrder: 40000,
    estimatedDeliveryTime: "60-75 min",
  },
]

export const seedDeliveryAreas = authMutation({
  args: {
    organizationId: v.string(),
    restaurantLocationId: v.string(),
  },
  handler: async (ctx, args) => {
    const restaurantLocationId = ctx.db.normalizeId(
      "restaurantLocations",
      args.restaurantLocationId
    )
    if (!restaurantLocationId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "El ID de la ubicación del restaurante es requerido",
      })
    }

    // Check if delivery areas already exist for this organization
    const existingAreas = await ctx.db
      .query("deliveryAreas")
      .withIndex("by_organization_id", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()

    if (existingAreas.length > 0) {
      return {
        success: false,
        message: "Delivery areas already exist for this organization",
        existingCount: existingAreas.length,
      }
    }

    // Insert default delivery areas
    const createdAreas = []
    for (const area of defaultDeliveryAreas) {
      const id = await ctx.db.insert("deliveryAreas", {
        ...area,
        organizationId: args.organizationId,
        restaurantLocationId: restaurantLocationId,
      })
      const createdArea = await ctx.db.get(id)
      if (createdArea) {
        await aggregateDeliveryAreasByOrganization.insertIfDoesNotExist(
          ctx,
          createdArea
        )
      }
      createdAreas.push(id)
    }

    return {
      success: true,
      message: `Successfully created ${createdAreas.length} delivery areas`,
      createdAreaIds: createdAreas,
    }
  },
})
