import { describe, expect, it } from "vitest"
import type { Id } from "../_generated/dataModel"
import {
  buildRecommendationsFromResults,
  computeRunScoreBreakdown,
  evaluateDeterministic,
  parseJudgeResponse,
} from "./agentBenchmarkRunner"
import type { BenchmarkCase, JudgeRubric } from "./agentBenchmarkTypes"

function asCaseId(id: string): Id<"agentBenchmarkCases"> {
  return id as Id<"agentBenchmarkCases">
}

const baseCase: BenchmarkCase = {
  caseKey: "test-case",
  name: "Caso de prueba",
  priority: "high",
  category: "flow",
  inputScript: [{ role: "user", text: "Hola" }],
  mockContext: {},
  expectedDeterministic: {
    requiredTools: ["searchMenuProductsTool", "confirmOrderTool"],
    requiredToolOrder: ["searchMenuProductsTool", "confirmOrderTool"],
    disallowInternalLeakage: true,
  },
  judgeRubric: {
    clarityWeight: 0.2,
    accuracyWeight: 0.2,
    contextWeight: 0.2,
    policyWeight: 0.2,
    toneWeight: 0.2,
    successDefinition: "Debe respetar flujo",
  },
  critical: true,
}

describe("evaluateDeterministic", () => {
  it("passes when tools and order are correct and no leakage", () => {
    const result = evaluateDeterministic(
      baseCase,
      ["searchMenuProductsTool", "confirmOrderTool"],
      ["Perfecto, ya validé y te muestro el resumen."]
    )

    expect(result.passed).toBe(true)
    expect(result.score).toBe(100)
    expect(result.checks.every((check) => check.passed)).toBe(true)
  })

  it("fails critical when required tool order is broken", () => {
    const result = evaluateDeterministic(
      baseCase,
      ["confirmOrderTool", "searchMenuProductsTool"],
      ["Listo."]
    )

    expect(result.passed).toBe(false)
    expect(
      result.checks.some(
        (check) => check.name === "required_tool_order" && !check.passed
      )
    ).toBe(true)
  })

  it("fails critical on internal leakage patterns", () => {
    const result = evaluateDeterministic(
      baseCase,
      ["searchMenuProductsTool", "confirmOrderTool"],
      ["Aquí tienes el ITEMS_JSON con _id interno y threadId."]
    )

    expect(
      result.checks.some(
        (check) => check.name === "internal_leakage" && !check.passed
      )
    ).toBe(true)
    expect(result.passed).toBe(false)
  })

  it("detects prohibited tools", () => {
    const caseWithProhibited: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        ...baseCase.expectedDeterministic,
        prohibitedTools: ["makeOrderTool"],
      },
    }
    const result = evaluateDeterministic(
      caseWithProhibited,
      ["searchMenuProductsTool", "confirmOrderTool", "makeOrderTool"],
      ["Listo."]
    )

    expect(
      result.checks.some(
        (check) =>
          check.name === "prohibited_tool:makeOrderTool" && !check.passed
      )
    ).toBe(true)
  })

  it("detects forbidden phrases", () => {
    const caseWithForbidden: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        ...baseCase.expectedDeterministic,
        forbiddenPhrases: ["no puedo ayudarte"],
      },
    }
    const result = evaluateDeterministic(
      caseWithForbidden,
      ["searchMenuProductsTool", "confirmOrderTool"],
      ["Lo siento, no puedo ayudarte con eso."]
    )

    expect(
      result.checks.some(
        (check) =>
          check.name === "forbidden_phrase:no puedo ayudarte" && !check.passed
      )
    ).toBe(true)
  })

  it("detects missing required phrases", () => {
    const caseWithRequired: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        ...baseCase.expectedDeterministic,
        requiredPhrases: ["menú"],
      },
    }
    const result = evaluateDeterministic(
      caseWithRequired,
      ["searchMenuProductsTool", "confirmOrderTool"],
      ["Aquí tienes la información."]
    )

    expect(
      result.checks.some(
        (check) => check.name === "required_phrase:menú" && !check.passed
      )
    ).toBe(true)
  })

  it("enforces maxToolCalls", () => {
    const caseWithMax: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        ...baseCase.expectedDeterministic,
        maxToolCalls: 2,
      },
    }
    const result = evaluateDeterministic(
      caseWithMax,
      ["searchMenuProductsTool", "confirmOrderTool", "makeOrderTool"],
      ["Listo."]
    )

    expect(
      result.checks.some(
        (check) => check.name === "max_tool_calls" && !check.passed
      )
    ).toBe(true)
  })

  it("handles empty tool calls array", () => {
    const result = evaluateDeterministic(baseCase, [], ["Hola."])

    expect(result.passed).toBe(false)
    expect(
      result.checks.some(
        (check) =>
          check.name === "required_tool:searchMenuProductsTool" && !check.passed
      )
    ).toBe(true)
  })

  it("handles empty transcript", () => {
    const result = evaluateDeterministic(
      baseCase,
      ["searchMenuProductsTool", "confirmOrderTool"],
      []
    )

    expect(result.passed).toBe(true)
  })

  it("handles multiple simultaneous check failures", () => {
    const complexCase: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        requiredTools: ["searchMenuProductsTool"],
        prohibitedTools: ["makeOrderTool"],
        forbiddenPhrases: ["error interno"],
        maxToolCalls: 1,
        disallowInternalLeakage: true,
      },
    }
    const result = evaluateDeterministic(
      complexCase,
      ["makeOrderTool", "searchMenuProductsTool"],
      ["Hubo un error interno con _id del sistema."]
    )

    const failedChecks = result.checks.filter((c) => !c.passed)
    expect(failedChecks.length).toBeGreaterThanOrEqual(3)
    expect(result.passed).toBe(false)
  })
})

describe("computeRunScoreBreakdown", () => {
  const makeResult = (
    category: BenchmarkCase["category"],
    finalScore: number,
    detScore: number,
    judgeScore: number
  ) => ({
    modelProfile: "configured" as const,
    caseId: asCaseId("test"),
    category,
    critical: false,
    deterministic: { passed: true, score: detScore, checks: [] },
    judge: { score: judgeScore, rationale: "ok" },
    finalScore,
    pass: true,
    criticalFailure: false,
    toolCalls: [],
    assistantTranscript: [],
    traceRef: "test",
    durationMs: 100,
  })

  it("returns zeros for empty results", () => {
    const breakdown = computeRunScoreBreakdown([])
    expect(breakdown.deterministic).toBe(0)
    expect(breakdown.judge).toBe(0)
    expect(breakdown.flow).toBe(0)
    expect(breakdown.safety).toBe(0)
    expect(breakdown.toolUsage).toBe(0)
    expect(breakdown.conversational).toBe(0)
  })

  it("computes averages for all-passing results", () => {
    const results = [
      makeResult("flow", 90, 95, 80),
      makeResult("flow", 80, 85, 70),
    ]
    const breakdown = computeRunScoreBreakdown(results)
    expect(breakdown.deterministic).toBe(90)
    expect(breakdown.judge).toBe(75)
    expect(breakdown.flow).toBe(85)
  })

  it("computes category scores correctly", () => {
    const results = [
      makeResult("flow", 90, 90, 90),
      makeResult("security", 70, 70, 70),
      makeResult("tools", 80, 80, 80),
      makeResult("tone", 60, 60, 60),
    ]
    const breakdown = computeRunScoreBreakdown(results)
    expect(breakdown.flow).toBe(90)
    expect(breakdown.safety).toBe(70)
    expect(breakdown.toolUsage).toBe(80)
    expect(breakdown.conversational).toBe(60)
  })

  it("handles results with only one category", () => {
    const results = [makeResult("security", 75, 80, 65)]
    const breakdown = computeRunScoreBreakdown(results)
    expect(breakdown.safety).toBe(75)
    expect(breakdown.flow).toBe(0)
  })
})

describe("buildRecommendationsFromResults", () => {
  const makeFailedResult = (
    category: BenchmarkCase["category"],
    failedCheckNames: string[]
  ) => ({
    modelProfile: "configured" as const,
    caseId: asCaseId("case-1"),
    category,
    critical: true,
    deterministic: {
      passed: false,
      score: 30,
      checks: failedCheckNames.map((name) => ({
        name,
        passed: false,
        critical: true,
        details: `Failed: ${name}`,
      })),
    },
    judge: { score: 50, rationale: "ok" },
    finalScore: 40,
    pass: false,
    criticalFailure: true,
    toolCalls: [],
    assistantTranscript: [],
    traceRef: "test",
    durationMs: 100,
  })

  it("returns empty array when no failures", () => {
    const result = buildRecommendationsFromResults({
      runResults: [
        {
          modelProfile: "configured",
          caseId: asCaseId("c1"),
          category: "flow",
          critical: false,
          deterministic: { passed: true, score: 100, checks: [] },
          judge: { score: 90, rationale: "ok" },
          finalScore: 95,
          pass: true,
          criticalFailure: false,
          toolCalls: [],
          assistantTranscript: [],
          traceRef: "t",
          durationMs: 100,
        },
      ],
      agentConfig: null,
    })
    expect(result).toEqual([])
  })

  it("generates tool order recommendation for required_tool_order failures", () => {
    const results = [makeFailedResult("flow", ["required_tool_order"])]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.some((r) => r.section === "coreConversationOverride")).toBe(
      true
    )
    expect(recs.some((r) => r.affectedCases.length > 0)).toBe(true)
  })

  it("generates leakage recommendation for internal_leakage failures", () => {
    const results = [makeFailedResult("security", ["internal_leakage"])]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.some((r) => r.section === "coreOperationsOverride")).toBe(true)
  })

  it("generates required tool recommendation", () => {
    const results = [
      makeFailedResult("flow", ["required_tool:searchMenuProductsTool"]),
    ]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.some((r) => r.section === "coreToolsOverride")).toBe(true)
    expect(
      recs.some((r) => r.problemPattern.includes("searchMenuProductsTool"))
    ).toBe(true)
  })

  it("generates prohibited tool recommendation", () => {
    const results = [
      makeFailedResult("security", ["prohibited_tool:makeOrderTool"]),
    ]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.some((r) => r.problemPattern.includes("makeOrderTool"))).toBe(
      true
    )
  })

  it("limits to 10 recommendations max", () => {
    const results = Array.from({ length: 20 }, (_, i) =>
      makeFailedResult("flow", [`required_tool:tool_${i}`])
    )
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.length).toBeLessThanOrEqual(10)
  })

  it("sorts by confidence descending", () => {
    const results = [
      makeFailedResult("flow", ["required_tool_order"]),
      makeFailedResult("flow", ["required_tool_order"]),
      makeFailedResult("security", ["internal_leakage"]),
    ]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i]!.confidence).toBeLessThanOrEqual(recs[i - 1]!.confidence)
    }
  })
})

describe("parseJudgeResponse", () => {
  const testRubric: JudgeRubric = {
    clarityWeight: 0.25,
    accuracyWeight: 0.25,
    contextWeight: 0.2,
    policyWeight: 0.2,
    toneWeight: 0.1,
    successDefinition: "Test rubric",
  }

  it("parses valid JSON with all dimensions and computes weighted score", () => {
    const input = JSON.stringify({
      clarity: 90,
      accuracy: 80,
      context: 70,
      policy: 85,
      tone: 75,
      rationale: "Good performance overall",
    })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.rationale).toBe("Good performance overall")
    expect(result!.dimensions).toBeDefined()
    expect(result!.dimensions!.clarity).toBe(90)
    expect(result!.dimensions!.accuracy).toBe(80)
    expect(result!.dimensions!.context).toBe(70)
    expect(result!.dimensions!.policy).toBe(85)
    expect(result!.dimensions!.tone).toBe(75)

    // Weighted: 90*0.25 + 80*0.25 + 70*0.2 + 85*0.2 + 75*0.1 = 22.5+20+14+17+7.5 = 81
    expect(result!.score).toBe(81)
  })

  it("parses valid JSON with single score field", () => {
    const input = JSON.stringify({ score: 85, rationale: "OK" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(85)
    expect(result!.rationale).toBe("OK")
    expect(result!.dimensions).toBeUndefined()
  })

  it("returns null for invalid JSON", () => {
    const result = parseJudgeResponse("not json at all", testRubric)
    expect(result).toBeNull()
  })

  it("returns null for empty string", () => {
    const result = parseJudgeResponse("", testRubric)
    expect(result).toBeNull()
  })

  it("returns null for JSON without required fields", () => {
    const input = JSON.stringify({ foo: "bar", baz: 42 })
    const result = parseJudgeResponse(input, testRubric)
    expect(result).toBeNull()
  })

  it("uses default rationale when rationale is missing from dimensions response", () => {
    const input = JSON.stringify({
      clarity: 80,
      accuracy: 70,
      context: 60,
      policy: 50,
      tone: 90,
    })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.rationale).toBe(
      "Evaluación automática sin justificación detallada"
    )
    expect(result!.dimensions).toBeDefined()
  })

  it("uses default rationale when rationale is empty string", () => {
    const input = JSON.stringify({ score: 75, rationale: "   " })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(75)
    expect(result!.rationale).toBe(
      "Evaluación automática sin justificación detallada"
    )
  })

  it("clamps score above 100 to 100", () => {
    const input = JSON.stringify({ score: 150, rationale: "Exceeded" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(100)
  })

  it("clamps score below 0 to 0", () => {
    const input = JSON.stringify({ score: -20, rationale: "Negative" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(0)
  })

  it("clamps individual dimension values to 0-100 range", () => {
    const input = JSON.stringify({
      clarity: 120,
      accuracy: -10,
      context: 200,
      policy: 50,
      tone: 80,
      rationale: "Extreme values",
    })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.dimensions!.clarity).toBe(100)
    expect(result!.dimensions!.accuracy).toBe(0)
    expect(result!.dimensions!.context).toBe(100)
    expect(result!.dimensions!.policy).toBe(50)
    expect(result!.dimensions!.tone).toBe(80)
    // Score clamped: 100*0.25 + 0*0.25 + 100*0.2 + 50*0.2 + 80*0.1 = 25+0+20+10+8 = 63
    expect(result!.score).toBe(63)
  })

  it("extracts JSON from surrounding text (markdown code blocks)", () => {
    const input = `Here is my evaluation:
\`\`\`json
{"score": 72, "rationale": "Decent"}
\`\`\`
That's my assessment.`
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(72)
    expect(result!.rationale).toBe("Decent")
  })

  it("rounds fractional scores to nearest integer", () => {
    const input = JSON.stringify({ score: 77.8, rationale: "Almost" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(78)
  })

  it("prefers dimensions over single score when both present", () => {
    const input = JSON.stringify({
      clarity: 100,
      accuracy: 100,
      context: 100,
      policy: 100,
      tone: 100,
      score: 50,
      rationale: "Both present",
    })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    // Dimensions path should produce score=100, not 50
    expect(result!.score).toBe(100)
    expect(result!.dimensions).toBeDefined()
  })

  it("returns null when score is a string instead of number", () => {
    const input = JSON.stringify({ score: "85", rationale: "ok" })
    const result = parseJudgeResponse(input, testRubric)
    expect(result).toBeNull()
  })

  it("returns null when greedy regex captures invalid multi-object span", () => {
    const input = `First: {"score": 60, "rationale": "first"} and then {"score": 90, "rationale": "second"}`
    const result = parseJudgeResponse(input, testRubric)
    expect(result).toBeNull()
  })

  it("handles unicode and emoji in rationale", () => {
    const input = JSON.stringify({
      score: 80,
      rationale: "Buen manejo del pedido. El resultado es correcto.",
    })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(80)
    expect(result!.rationale).toContain("Buen manejo")
  })

  it("handles nested JSON objects without dimensions or score", () => {
    const input = JSON.stringify({
      evaluation: { clarity: 90 },
      metadata: { version: "1.0" },
    })
    const result = parseJudgeResponse(input, testRubric)
    expect(result).toBeNull()
  })

  it("handles score of exactly 0", () => {
    const input = JSON.stringify({ score: 0, rationale: "Terrible" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(0)
    expect(result!.rationale).toBe("Terrible")
  })

  it("handles score of exactly 100", () => {
    const input = JSON.stringify({ score: 100, rationale: "Perfect" })
    const result = parseJudgeResponse(input, testRubric)

    expect(result).not.toBeNull()
    expect(result!.score).toBe(100)
  })
})

describe("evaluateDeterministic — additional edge cases", () => {
  it("passes with minimal case (no optional fields set)", () => {
    const minimalCase: BenchmarkCase = {
      caseKey: "minimal",
      name: "Caso mínimo",
      priority: "low",
      category: "tone",
      inputScript: [{ role: "user", text: "Hola" }],
      mockContext: {},
      expectedDeterministic: {},
      judgeRubric: {
        clarityWeight: 0.2,
        accuracyWeight: 0.2,
        contextWeight: 0.2,
        policyWeight: 0.2,
        toneWeight: 0.2,
        successDefinition: "Responder",
      },
      critical: false,
    }
    const result = evaluateDeterministic(minimalCase, [], ["Hola!"])
    expect(result.passed).toBe(true)
    expect(result.score).toBe(100)
    expect(result.checks).toHaveLength(0)
  })

  it("handles special regex characters in forbidden phrases", () => {
    const specialCase: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        forbiddenPhrases: ["precio: $50.000 (iva incluido)"],
        disallowInternalLeakage: false,
      },
    }
    const result = evaluateDeterministic(
      specialCase,
      [],
      ["El precio: $50.000 (IVA incluido) ya está aplicado."]
    )
    expect(
      result.checks.some(
        (c) =>
          c.name === "forbidden_phrase:precio: $50.000 (iva incluido)" &&
          !c.passed
      )
    ).toBe(true)
  })

  it("handles duplicate tool calls correctly", () => {
    const caseWithMax: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        requiredTools: ["searchMenuProductsTool"],
        maxToolCalls: 3,
        disallowInternalLeakage: false,
      },
    }
    const result = evaluateDeterministic(
      caseWithMax,
      [
        "searchMenuProductsTool",
        "searchMenuProductsTool",
        "searchMenuProductsTool",
      ],
      ["Resultado."]
    )
    expect(result.passed).toBe(true)
    expect(result.score).toBe(100)
  })

  it("normalizes accented characters when checking phrases", () => {
    const caseWithRequired: BenchmarkCase = {
      ...baseCase,
      expectedDeterministic: {
        requiredPhrases: ["dirección válida"],
        disallowInternalLeakage: false,
      },
    }
    const result = evaluateDeterministic(
      caseWithRequired,
      [],
      ["Tu DIRECCIÓN VÁLIDA ha sido confirmada."]
    )
    expect(
      result.checks.some(
        (c) => c.name === "required_phrase:dirección válida" && c.passed
      )
    ).toBe(true)
  })

  it("detects leakage pattern 'tool-call' in transcript", () => {
    const result = evaluateDeterministic(
      baseCase,
      ["searchMenuProductsTool", "confirmOrderTool"],
      ["Ejecuté tool-call searchMenuProductsTool para ti."]
    )
    expect(
      result.checks.some((c) => c.name === "internal_leakage" && !c.passed)
    ).toBe(true)
  })
})

describe("buildRecommendationsFromResults — additional edge cases", () => {
  const makeFailedResult = (
    category: BenchmarkCase["category"],
    failedCheckNames: string[]
  ) => ({
    modelProfile: "configured" as const,
    caseId: asCaseId("case-1"),
    category,
    critical: true,
    deterministic: {
      passed: false,
      score: 30,
      checks: failedCheckNames.map((name) => ({
        name,
        passed: false,
        critical: true,
        details: `Failed: ${name}`,
      })),
    },
    judge: { score: 50, rationale: "ok" },
    finalScore: 40,
    pass: false,
    criticalFailure: true,
    toolCalls: [],
    assistantTranscript: [],
    traceRef: "test",
    durationMs: 100,
  })

  it("generates recommendations for mixed categories of failures", () => {
    const results = [
      makeFailedResult("flow", ["required_tool_order"]),
      makeFailedResult("security", ["internal_leakage"]),
      makeFailedResult("tools", ["required_tool:searchMenuProductsTool"]),
      makeFailedResult("tone", ["forbidden_phrase:no sé"]),
    ]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.length).toBeGreaterThanOrEqual(4)
    const sections = recs.map((r) => r.section)
    expect(sections).toContain("coreConversationOverride")
    expect(sections).toContain("coreOperationsOverride")
    expect(sections).toContain("coreToolsOverride")
    expect(sections).toContain("specialInstructions")
  })

  it("generates max_tool_calls recommendation", () => {
    const results = [makeFailedResult("tools", ["max_tool_calls"])]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    expect(recs.some((r) => r.section === "coreToolsOverride")).toBe(true)
    expect(
      recs.some((r) => r.problemPattern.includes("llamadas a herramientas"))
    ).toBe(true)
  })

  it("generates category-level recommendation when failure rate > 50%", () => {
    const passingResult = {
      modelProfile: "configured" as const,
      caseId: asCaseId("pass-1"),
      category: "escalation" as const,
      critical: false,
      deterministic: { passed: true, score: 100, checks: [] },
      judge: { score: 90, rationale: "ok" },
      finalScore: 95,
      pass: true,
      criticalFailure: false,
      toolCalls: [],
      assistantTranscript: [],
      traceRef: "t",
      durationMs: 100,
    }
    const escalationFail = {
      modelProfile: "configured" as const,
      caseId: asCaseId("esc-fail"),
      category: "escalation" as const,
      critical: false,
      deterministic: {
        passed: true,
        score: 100,
        checks: [],
      },
      judge: { score: 20, rationale: "bad" },
      finalScore: 30,
      pass: false,
      criticalFailure: false,
      toolCalls: [],
      assistantTranscript: [],
      traceRef: "t",
      durationMs: 100,
    }
    const results = [
      passingResult,
      escalationFail,
      { ...escalationFail, caseId: asCaseId("esc-fail-2") },
      { ...escalationFail, caseId: asCaseId("esc-fail-3") },
    ]
    const recs = buildRecommendationsFromResults({
      runResults: results,
      agentConfig: null,
    })
    // Should have a category-level recommendation for escalation since 3/4 = 75% failure
    expect(recs.some((r) => r.problemPattern.includes("escalation"))).toBe(true)
  })
})
