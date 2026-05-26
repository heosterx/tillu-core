import { v4 as uuidv4 } from "uuid";
import { classify } from "./classifier";
import { plan } from "./planner";
import { write } from "./writer";
import type {
  ClassifierOutput,
  TilluOutput,
  TilluAction,
  TilluResponse,
  ActionStep,
  ToolCall,
} from "../types";

export interface PipelineInput {
  userInput: string;
  contextSummary: string;
  userState?: string;
  image?: string;
}

export interface PipelineResult {
  output: TilluOutput;
  classification: ClassifierOutput;
  latency_ms: number;
}

/**
 * The 4-stage pipeline:
 *   Stage 1: Classify (Cerebras) — intent + routing decision
 *   Stage 2: Plan (Groq) — tool calls [ACTION PATH]
 *   Stage 3: Write (Gemini) — final response text [RESPONSE PATH]
 *   Stage 4: Voice — handled by voice.tool.ts after pipeline
 *
 * Response and Action paths run in PARALLEL after classification.
 */
export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const start = Date.now();
  const { userInput, contextSummary, userState } = input;

  // ── Stage 1: Classify ──────────────────────────────────────────────────────
  const classification = await classify(userInput, contextSummary);

  // ── Parallel execution ─────────────────────────────────────────────────────
  const [responseResult, actionResult] = await Promise.allSettled([
    // RESPONSE PATH
    (async (): Promise<TilluResponse | null> => {
      if (!classification.has_response) return null;

      // Short-circuit: no tools needed, writer answers directly from context
      const toolResults = classification.short_circuit
        ? `Context: ${contextSummary}`
        : ""; // will be filled after action path

      const text = await write(userInput, toolResults, contextSummary, userState);
      return { text, lang: "hi-en" };
    })(),

    // ACTION PATH
    (async (): Promise<TilluAction | null> => {
      if (!classification.has_action || classification.short_circuit) return null;

      const planResult = await plan(classification.intent, userInput, contextSummary);
      if (planResult.tool_calls.length === 0) return null;

      const steps: ActionStep[] = planResult.tool_calls.map((tc: ToolCall) => ({
        id: uuidv4(),
        tool: tc.tool as ActionStep["tool"],
        action: tc.tool,
        params: tc.params,
        status: "pending",
      }));

      return {
        id: uuidv4(),
        plan: steps,
        status: "pending",
        requires_confirmation: classification.needs_confirmation,
        confirmation_message: classification.needs_confirmation
          ? `I'm about to ${steps[0]?.action ?? "perform an action"}. Confirm?`
          : undefined,
      };
    })(),
  ]);

  const response = responseResult.status === "fulfilled" ? responseResult.value : null;
  const action = actionResult.status === "fulfilled" ? actionResult.value : null;

  if (responseResult.status === "rejected") {
    console.error("[Pipeline] Response path failed:", responseResult.reason);
  }
  if (actionResult.status === "rejected") {
    console.error("[Pipeline] Action path failed:", actionResult.reason);
  }

  return {
    output: { response, action },
    classification,
    latency_ms: Date.now() - start,
  };
}
