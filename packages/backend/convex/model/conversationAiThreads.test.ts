import { describe, expect, it } from "vitest"
import { buildConversationChildThreadCreationArgs } from "./conversationAiThreads"

describe("buildConversationChildThreadCreationArgs", () => {
  it("links child threads to the parent conversation thread", () => {
    const args = buildConversationChildThreadCreationArgs({
      organizationId: "org_123",
      threadId: "thread_parent",
    })

    expect(args).toEqual({
      parentThreadIds: ["thread_parent"],
      summary: undefined,
      title: undefined,
      userId: "org_123",
    })
  })

  it("preserves optional metadata for the child thread", () => {
    const args = buildConversationChildThreadCreationArgs(
      {
        organizationId: "org_123",
        threadId: "thread_parent",
      },
      {
        summary: "Resumen auxiliar",
        title: "Thread de validacion",
      }
    )

    expect(args).toEqual({
      parentThreadIds: ["thread_parent"],
      summary: "Resumen auxiliar",
      title: "Thread de validacion",
      userId: "org_123",
    })
  })
})
