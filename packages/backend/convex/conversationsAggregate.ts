import { TableAggregate } from "@convex-dev/aggregate"
import { components } from "./_generated/api"
import type { DataModel } from "./_generated/dataModel"

const aggregateComponents = components as typeof components & {
  aggregateConversationsByOrganization: typeof components.aggregateOrdersByOrganization
}

export const aggregateConversationsByOrganization = new TableAggregate<{
  Namespace: string
  Key: number
  DataModel: DataModel
  TableName: "conversations"
}>(aggregateComponents.aggregateConversationsByOrganization, {
  namespace: (doc) => doc.organizationId,
  sortKey: (doc) => doc._creationTime,
  sumValue: (doc) => doc.cost ?? 0,
})
