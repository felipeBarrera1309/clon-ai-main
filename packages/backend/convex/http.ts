import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { authComponent, createAuth } from "./auth"
import { resend } from "./sendEmails"
import {
  dialog360PostWebhook,
  gupshupGetWebhook,
  gupshupPostWebhook,
  twilioPostWebhook,
  whatsappGetWebhook,
  whatsappPostWebhook,
  widgetIncoming,
  widgetOptions,
} from "./webhooks"

const http = httpRouter()

// Register Better Auth routes
authComponent.registerRoutes(http, createAuth)

http.route({
  path: "/webhook",
  method: "GET",
  handler: whatsappGetWebhook,
})

http.route({
  path: "/webhook",
  method: "POST",
  handler: whatsappPostWebhook,
})

http.route({
  path: "/whatsapp/incoming",
  method: "POST",
  handler: widgetIncoming,
})

http.route({
  path: "/whatsapp/incoming",
  method: "OPTIONS",
  handler: widgetOptions,
})

http.route({
  path: "/resend-webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    return await resend.handleResendEventWebhook(ctx, req)
  }),
})

http.route({
  path: "/twilioPostWebhook",
  method: "POST",
  handler: twilioPostWebhook,
})

http.route({
  path: "/dialog360Webhook",
  method: "POST",
  handler: dialog360PostWebhook,
})

http.route({
  path: "/gupshupWebhook",
  method: "GET",
  handler: gupshupGetWebhook,
})

http.route({
  path: "/gupshupWebhook",
  method: "POST",
  handler: gupshupPostWebhook,
})

export default http
