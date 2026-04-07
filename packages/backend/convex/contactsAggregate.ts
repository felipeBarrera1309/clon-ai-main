import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"

const aggregateComponents = components as typeof components & {
  aggregateContactsByOrganization: typeof components.aggregateOrdersByOrganization
}

export const aggregateContactsByOrganization = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: "contacts"
}>(aggregateComponents.aggregateContactsByOrganization, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc._creationTime,
})
