import { callCerebras } from "./providers/cerebras";
import { callGroq } from "./providers/groq";
import { callOpenRouter } from "./providers/openrouter";
import { callTogether } from "./providers/together";
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
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
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
 * Provider chain: Cerebras (GLM-4-9B) → Groq → Together AI → OpenRouter → default
 * Target latency: ~200ms
 */
export async function classify(
  userInput: string,
  contextSummary: string
): Promise<ClassifierOutput> {
  const prompt = classifierPrompt(userInput, contextSummary);
  const messages = [{ role: "user" as const, content: prompt }];

  // 1. Cerebras GLM-4-9B — fastest free model
  try {
    const raw = await callCerebras(messages, { maxTokens: 128, temperature: 0, jsonMode: true });
    return parseClassifierOutput(raw);
  } catch (e) {
    console.warn("[Classifier] Cerebras failed:", (e as Error).message.slice(0, 80));
  }

  // 2. Groq — fast fallback
  try {
    const raw = await callGroq(messages, { maxTokens: 128, temperature: 0, jsonMode: true });
    return parseClassifierOutput(raw);
  } catch (e) {
    console.warn("[Classifier] Groq failed:", (e as Error).message.slice(0, 80));
  }

  // 3. Together AI — free Llama-3.3-70B
  try {
    const raw = await callTogether(messages, { maxTokens: 128, temperature: 0, jsonMode: true });
    return parseClassifierOutput(raw);
  } catch (e) {
    console.warn("[Classifier] Together AI failed:", (e as Error).message.slice(0, 80));
  }

  // 4. OpenRouter — tertiary
  try {
    const raw = await callOpenRouter(messages, { maxTokens: 128, temperature: 0, jsonMode: true });
    return parseClassifierOutput(raw);
  } catch (e) {
    console.warn("[Classifier] OpenRouter failed:", (e as Error).message.slice(0, 80));
  }

  // 5. Safe default — treat as conversation, no tools
  console.warn("[Classifier] All providers failed — using default output");
  return DEFAULT_OUTPUT;
}
