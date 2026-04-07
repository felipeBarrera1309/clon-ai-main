import { v } from "convex/values"
import { components, internal } from "../_generated/api"
import { internalAction } from "../_generated/server"
import type {
  BenchmarkCase,
  OrgOverlayRestaurantConfig,
} from "./agentBenchmarkTypes"

export function buildOrgOverlayCases(args: {
  organizationId: string
  restaurantConfig: OrgOverlayRestaurantConfig | null
  debugSignals: Array<{ reason: string }>
}): BenchmarkCase[] {
  const cases: BenchmarkCase[] = []
  const hasDelivery = args.restaurantConfig?.enableDelivery ?? true
  const hasPickup = args.restaurantConfig?.enablePickup ?? true
  const hasInvoice = args.restaurantConfig?.enableElectronicInvoice ?? false
  const hasSodexo = args.restaurantConfig?.acceptSodexoVoucher ?? false

  cases.push({
    caseKey: `org-${args.organizationId}-pickup-delivery-clarity`,
    name: "Aclaración de tipo de pedido según configuración de la organización",
    priority: "high",
    category: "flow",
    inputScript: [
      {
        role: "user",
        text: "Quiero pedir pero no sé si es para recoger o domicilio",
      },
      { role: "user", text: "¿Qué me recomiendas?" },
    ],
    mockContext: {
      includePayment: true,
      includeMenuLookup: true,
    },
    expectedDeterministic: {
      prohibitedTools: hasDelivery && hasPickup ? [] : ["validateAddressTool"],
      disallowInternalLeakage: true,
    },
    judgeRubric: {
      clarityWeight: 0.3,
      accuracyWeight: 0.2,
      contextWeight: 0.2,
      policyWeight: 0.2,
      toneWeight: 0.1,
      expectedTone: "claro",
      successDefinition:
        "Explica opciones disponibles y dirige al cliente al flujo correcto sin ambigüedad",
    },
    critical: true,
  })

  if (hasDelivery) {
    cases.push({
      caseKey: `org-${args.organizationId}-delivery-address-validation`,
      name: "Validación de dirección en flujo delivery",
      priority: "high",
      category: "coverage",
      inputScript: [
        { role: "user", text: "Quiero domicilio para la carrera 20 # 10-55" },
        { role: "user", text: "Es en Bucaramanga" },
      ],
      mockContext: {
        includeAddressValidation: true,
        includePayment: true,
      },
      expectedDeterministic: {
        requiredTools: ["validateAddressTool"],
        disallowInternalLeakage: true,
      },
      judgeRubric: {
        clarityWeight: 0.2,
        accuracyWeight: 0.3,
        contextWeight: 0.2,
        policyWeight: 0.2,
        toneWeight: 0.1,
        expectedTone: "resolutivo",
        successDefinition:
          "Valida cobertura antes de avanzar y comunica resultado con claridad",
      },
      critical: true,
    })
  }

  if (hasInvoice) {
    cases.push({
      caseKey: `org-${args.organizationId}-invoice-flow`,
      name: "Manejo de factura electrónica cuando aplica",
      priority: "medium",
      category: "payment",
      inputScript: [
        { role: "user", text: "Necesito factura electrónica para este pedido" },
        { role: "user", text: "Mi NIT es 900123456-7" },
      ],
      mockContext: {
        includePayment: true,
      },
      expectedDeterministic: {
        requiredTools: ["requestInvoiceDataTool"],
      },
      judgeRubric: {
        clarityWeight: 0.2,
        accuracyWeight: 0.25,
        contextWeight: 0.2,
        policyWeight: 0.25,
        toneWeight: 0.1,
        expectedTone: "profesional",
        successDefinition:
          "Solicita y valida información de factura sin saltarse pasos",
      },
      critical: false,
    })
  }

  if (hasSodexo) {
    cases.push({
      caseKey: `org-${args.organizationId}-sodexo-delivery-rejection`,
      name: "Restricción sodexo solo para pickup",
      priority: "high",
      category: "payment",
      inputScript: [
        { role: "user", text: "Quiero domicilio y pagar con bono sodexo" },
        { role: "user", text: "No puedo ir a recoger" },
      ],
      mockContext: {
        includePayment: true,
      },
      expectedDeterministic: {
        prohibitedTools: ["makeOrderTool"],
      },
      judgeRubric: {
        clarityWeight: 0.25,
        accuracyWeight: 0.25,
        contextWeight: 0.2,
        policyWeight: 0.2,
        toneWeight: 0.1,
        expectedTone: "firme y amable",
        successDefinition:
          "Aplica la regla de sodexo sin romper experiencia conversacional",
      },
      critical: true,
    })
  }

  const debugReasons = args.debugSignals.slice(0, 6)
  debugReasons.forEach((signal, index) => {
    const reason = signal.reason.toLowerCase()
    let inputScript: BenchmarkCase["inputScript"]

    if (reason.includes("dirección") || reason.includes("cobertura")) {
      inputScript = [
        { role: "user", text: "Quiero domicilio para la calle 80 # 15-30" },
        {
          role: "user",
          text: "¿Llegan hasta allá? Es en una zona residencial.",
        },
      ]
    } else if (reason.includes("precio") || reason.includes("menú")) {
      inputScript = [
        {
          role: "user",
          text: "¿Cuánto cuesta la pizza más grande que tengan?",
        },
        { role: "user", text: "¿Y tienen alguna promoción?" },
      ]
    } else if (reason.includes("pago") || reason.includes("método")) {
      inputScript = [
        { role: "user", text: "Quiero pagar con transferencia bancaria" },
        { role: "user", text: "¿Me dan los datos de la cuenta?" },
      ]
    } else if (reason.includes("pedido") || reason.includes("orden")) {
      inputScript = [
        { role: "user", text: "Quiero una pizza grande para domicilio" },
        { role: "user", text: "Calle 45 # 20-10, pago efectivo, confirmo" },
      ]
    } else {
      inputScript = [
        { role: "user", text: signal.reason },
        { role: "user", text: "¿Me ayudas con esto?" },
      ]
    }

    cases.push({
      caseKey: `org-${args.organizationId}-debug-replay-${index + 1}`,
      name: `Replay de motivo de debug ${index + 1}`,
      priority: "medium",
      category: "tools",
      inputScript,
      mockContext: {
        includeMenuLookup: true,
        includeCombinationValidation: true,
        includeOrderCreation: true,
      },
      expectedDeterministic: {
        disallowInternalLeakage: true,
      },
      judgeRubric: {
        clarityWeight: 0.2,
        accuracyWeight: 0.3,
        contextWeight: 0.2,
        policyWeight: 0.2,
        toneWeight: 0.1,
        expectedTone: "orientado a resolución",
        successDefinition:
          "Mitiga patrón de fallo histórico sin incumplir reglas críticas",
      },
      critical: false,
    })
  })

  const paddingTemplates = [
    {
      text: "Hola, quiero pedir algo pero no sé por dónde empezar.",
      followUp: "¿Me ayudas paso a paso?",
      category: "tone" as const,
    },
    {
      text: "¿Cuál es el horario de atención?",
      followUp: "¿Están abiertos ahora?",
      category: "coverage" as const,
    },
    {
      text: "¿En qué ubicación puedo recoger mi pedido?",
      followUp: "¿Cuál me queda más cerca?",
      category: "coverage" as const,
    },
    {
      text: "¿Qué métodos de pago aceptan?",
      followUp: "¿Puedo pagar con Nequi?",
      category: "payment" as const,
    },
    {
      text: "¿Hacen domicilio o solo para recoger?",
      followUp: "¿Cuánto cuesta el domicilio?",
      category: "flow" as const,
    },
    {
      text: "Hola buenas, ¿me pueden mostrar el menú?",
      followUp: "¿Qué me recomiendan?",
      category: "tone" as const,
    },
    {
      text: "Buenas noches, ¿todavía puedo pedir?",
      followUp: "¿Hasta qué hora atienden?",
      category: "coverage" as const,
    },
  ]

  let templateIndex = 0
  while (cases.length < 10) {
    const template = paddingTemplates[templateIndex % paddingTemplates.length]!
    const idx = cases.length + 1
    cases.push({
      caseKey: `org-${args.organizationId}-baseline-overlay-${idx}`,
      name: `Overlay base organizacional ${idx}`,
      priority: "medium",
      category: template.category,
      inputScript: [
        { role: "user", text: template.text },
        { role: "user", text: template.followUp },
      ],
      mockContext: {
        includeMenuLookup: true,
      },
      expectedDeterministic: {
        disallowInternalLeakage: true,
      },
      judgeRubric: {
        clarityWeight: 0.35,
        accuracyWeight: 0.2,
        contextWeight: 0.2,
        policyWeight: 0.15,
        toneWeight: 0.1,
        expectedTone: "cercano y claro",
        successDefinition:
          "Guía al usuario sin fricción y manteniendo el foco de pedido",
      },
      critical: false,
    })
    templateIndex++
  }

  return cases
}

export const scheduleWeekly = internalAction({
  args: {},
  handler: async (ctx) => {
    const organizations = await ctx.runQuery(
      components.betterAuth.organizations.listAll,
      {}
    )

    const STAGGER_DELAY_MS = 30_000
    let scheduled = 0
    for (const organization of organizations) {
      await ctx.runMutation(
        internal.system.agentBenchmarkDispatch.scheduleCreateRunFromTrigger,
        {
          delay: scheduled * STAGGER_DELAY_MS,
          organizationId: organization._id,
          trigger: "weekly",
        }
      )
      scheduled += 1
    }

    return { scheduled }
  },
})
