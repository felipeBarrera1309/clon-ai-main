import agent from "@convex-dev/agent/convex.config"
import aggregate from "@convex-dev/aggregate/convex.config"
import r2 from "@convex-dev/r2/convex.config"
import rag from "@convex-dev/rag/convex.config"
import resend from "@convex-dev/resend/convex.config"
import { defineApp } from "convex/server"
import betterAuth from "./betterAuth/convex.config"

const app = defineApp()
app.use(betterAuth)
app.use(agent)
app.use(r2)
app.use(rag)
app.use(resend)
app.use(aggregate, {
  name: "aggregateOrdersByOrganization",
})
app.use(aggregate, {
  name: "aggregateOrdersByRestaurantLocation",
})
app.use(aggregate, {
  name: "aggregateConversationsByOrganization",
})
app.use(aggregate, {
  name: "aggregateContactsByOrganization",
})
app.use(aggregate, {
  name: "aggregateMenuProductsByOrganization",
})
app.use(aggregate, {
  name: "aggregateRestaurantLocationsByOrganization",
})
app.use(aggregate, {
  name: "aggregateDeliveryAreasByOrganization",
})

export default app
