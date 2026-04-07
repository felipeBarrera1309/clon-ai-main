import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"

const aggregateComponents = components as typeof components & {
  aggregateDeliveryAreasByOrganization: typeof components.aggregateOrdersByOrganization
}

export const aggregateDeliveryAreasByOrganization = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: "deliveryAreas"
}>(aggregateComponents.aggregateDeliveryAreasByOrganization, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc._creationTime,
})
