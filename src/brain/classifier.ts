import { routeClassifier } from "./providers/router";
import { classifierPrompt } from "./prompts";
import type { ClassifierOutput } from "../types";

const DEFAULT_OUTPUT: ClassifierOutput = {
  intent: "conversation",
  has_response: true,
  has_action: false,
  needs_confirmation: false,
  urgency: "low",
  short_circuit: true,
};

function parseClassifierOutput(raw: string): ClassifierOutput {
  // Strip reasoning preamble — reasoning models think out loud before the JSON
  // Find the last JSON object in the output
  const jsonMatch = raw.match(/\{[^{}]*"intent"[^{}]*\}/s) ?? raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in classifier output");

  const cleaned = jsonMatch[0].trim();
  const parsed = JSON.parse(cleaned) as Partial<ClassifierOutput>;
  return {
    intent: parsed.intent ?? "conversation",
    has_response: parsed.has_response ?? true,
    has_action: parsed.has_action ?? false,
    needs_confirmation: parsed.needs_confirmation ?? false,
    urgency: parsed.urgency ?? "low",
    short_circuit: parsed.short_circuit ?? false,
  };
}

/**
 * Stage 1: Classify user intent.
 * Uses the load-balanced router — equal load across Groq, Cerebras, OpenRouter.
 * Target latency: ~200ms
 */
export async function classify(
  userInput: string,
  contextSummary: string
): Promise<ClassifierOutput> {
  const prompt = classifierPrompt(userInput, contextSummary);
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    const raw = await routeClassifier(messages);
    return parseClassifierOutput(raw);
  } catch (e) {
    console.warn("[Classifier] All providers failed — using default:", (e as Error).message.slice(0, 80));
    return DEFAULT_OUTPUT;
  }
}
