import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"

const aggregateComponents = components as typeof components & {
  aggregateMenuProductsByOrganization: typeof components.aggregateOrdersByOrganization
}

export const aggregateMenuProductsByOrganization = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: "menuProducts"
}>(aggregateComponents.aggregateMenuProductsByOrganization, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc._creationTime,
})
