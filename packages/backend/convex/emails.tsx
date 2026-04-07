// IMPORTANT: this is a Convex Node Action
"use node"
import { Resend } from "@convex-dev/resend"
import { Button, Html } from "@react-email/components"
import { pretty, render } from "@react-email/render"
import { components } from "./_generated/api"
import { action } from "./_generated/server"

export const resend: Resend = new Resend(components.resend, {
  testMode: false,
})

export const sendEmail = action({
  args: {},
  handler: async (ctx, _args) => {
    // 1. Generate the HTML from your JSX
    // This can come from a custom component in your /emails/ directory
    // if you would like to view your templates locally. For more info see:
    // https://react.email/docs/getting-started/manual-setup#5-run-locally
    const html = await pretty(
      await render(
        <Html>
          <Button
            href="https://clonai.co"
            style={{ background: "#000", color: "#fff", padding: "12px 20px" }}
          >
            Click me
          </Button>
        </Html>
      )
    )

    // 2. Send your email as usual using the component
    await resend.sendEmail(ctx, {
      from: "onboarding@resend.dev",
      to: "delivered@resend.dev",
      subject: "Hi there",
      html,
    })
  },
})
