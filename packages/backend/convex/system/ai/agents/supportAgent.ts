import { Agent } from "@convex-dev/agent"
import { components, internal } from "../../../_generated/api"
import type { Id } from "../../../_generated/dataModel"
import type { ActionCtx } from "../../../_generated/server"
import {
  createLanguageModel,
  DEFAULT_SUPPORT_AGENT_MODEL,
  sanitizeConfiguredAgentModel,
} from "../../../lib/aiModels"
import { buildCompleteAgentSystemPrompt } from "../constants"
import { askAboutMenuWithContext } from "../tools/askAboutMenuWithContext"
import { askCombinationValidation } from "../tools/askCombinationValidation"
import { cancelScheduledOrder } from "../tools/cancelScheduledOrder"
import { comboSlotFilling } from "../tools/comboSlotFilling"
import { confirmOrder } from "../tools/confirmOrder"
import { escalateConversation } from "../tools/escalateConversation"
import { makeOrder } from "../tools/makeOrder"
import { modifyScheduledOrder } from "../tools/modifyScheduledOrder"
import { requestInvoiceData } from "../tools/requestInvoiceData"
import { resolveConversation } from "../tools/resolveConversation"
import { saveCustomerName } from "../tools/saveCustomerName"
import { scheduleOrder } from "../tools/scheduleOrder"
import { searchCombos } from "../tools/searchCombos"
import { sendInteractiveMessageTool } from "../tools/sendInteractiveMessage"
import { sendMenuFiles } from "../tools/sendMenuFiles"
import { sendProductImageTool } from "../tools/sendProductImage"
import { sendRestaurantLocationTool } from "../tools/sendRestaurantLocation"
import { updateOrder } from "../tools/updateOrder"
import { validateAddress } from "../tools/validateAddress"
import { validateComboSelections } from "../tools/validateComboSelections"

export async function createSupportAgent(
  ctx: ActionCtx,
  args: {
    conversationId: Id<"conversations">
    useFallbackModel?: boolean
  }
) {
  const agentConfig = await ctx.runQuery(
    internal.system.agentConfiguration.getAgentConfiguration,
    {
      conversationId: args.conversationId,
    }
  )

  const systemPrompt = buildCompleteAgentSystemPrompt({
    ...agentConfig,
    hasMetaSupport: agentConfig.hasMetaSupport ?? false,
  })

  // Use fallback model (openai-o4-mini) on last retry attempt, otherwise use configured model
  const modelType = args.useFallbackModel
    ? ("openai-o4-mini" as const)
    : sanitizeConfiguredAgentModel(agentConfig.agentConfig?.supportAgentModel) ||
      DEFAULT_SUPPORT_AGENT_MODEL
  const languageModel = createLanguageModel(modelType)

  return new Agent(components.agent, {
    name: "supportAgent",
    languageModel,
    instructions: systemPrompt,
    tools: {
      saveCustomerNameTool: saveCustomerName,
      escalateConversationTool: escalateConversation,
      resolveConversationTool: resolveConversation,
      // Only include validateAddressTool if delivery is enabled
      ...(agentConfig.restaurantConfig?.enableDelivery !== false
        ? { validateAddressTool: validateAddress }
        : {}),
      searchMenuProductsTool: askAboutMenuWithContext,
      askCombinationValidationTool: askCombinationValidation,
      confirmOrderTool: confirmOrder,
      makeOrderTool: makeOrder,
      scheduleOrderTool: scheduleOrder,
      modifyScheduledOrderTool: modifyScheduledOrder,
      cancelScheduledOrderTool: cancelScheduledOrder,
      // Only include requestInvoiceDataTool if electronic invoice is enabled (default: true)
      ...(agentConfig.restaurantConfig?.enableElectronicInvoice !== false
        ? { requestInvoiceDataTool: requestInvoiceData }
        : {}),
      updateOrderTool: updateOrder,
      sendMenuFilesTool: sendMenuFiles,
      sendProductImageTool: sendProductImageTool,
      sendRestaurantLocationTool: sendRestaurantLocationTool,
      ...(agentConfig.hasMetaSupport
        ? { sendInteractiveMessageTool: sendInteractiveMessageTool }
        : {}),
      comboSlotFillingTool: comboSlotFilling,
      validateComboSelectionsTool: validateComboSelections,
      searchCombosTool: searchCombos,
    },
    callSettings: {
      maxRetries: 5,
    },
    stopWhen: async (options) => {
      // 1. Check max steps
      if (options.steps.length >= 15) return true

      // 2. Check for stop signal in the conversation
      const conversation = await ctx.runQuery(
        internal.system.conversations.getOne,
        {
          conversationId: args.conversationId,
        }
      )

      // Safe access
      if (conversation?.stopSignal) {
        console.log(
          `🛑 [SUPPORT AGENT] Stop signal detected. Ending execution.`
        )
        return true
      }

      return false
    },
  })
}
