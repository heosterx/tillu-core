import { callGroq } from "./providers/groq";
import { callTogether } from "./providers/together";
import { callOpenRouter } from "./providers/openrouter";
import { callGoogle } from "./providers/google";
import { callHuggingFace } from "./providers/huggingface";
import { plannerPrompt } from "./prompts";
import { TOOL_SCHEMA, TOOL_SCHEMA_TEXT } from "./tools.schema";
import type { ToolCall, PlannerOutput } from "../types";

function parseToolCalls(raw: string): ToolCall[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item: Record<string, unknown>) => ({
    tool: String(item.tool ?? item.name ?? ""),
    params: (item.params ?? item.arguments ?? {}) as Record<string, unknown>,
    reason: item.reason as string | undefined,
  }));
}

/**
 * Stage 2: Plan tool calls for a given intent.
 * Provider chain: Groq → Together AI → OpenRouter → Gemini → HF
 * Target latency: ~500ms
 */
export async function plan(
  intent: string,
  userInput: string,
  contextSummary: string
): Promise<PlannerOutput> {

  // 1. Groq — native function calling, most reliable for structured output
  try {
    const messages = [
      {
        role: "system" as const,
        content: plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT),
      },
      { role: "user" as const, content: userInput },
    ];
    const raw = await callGroq(messages, { tools: TOOL_SCHEMA, maxTokens: 512, temperature: 0 });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] Groq failed:", (e as Error).message.slice(0, 80));
  }

  // 2. Together AI — free Llama-3.3-70B, JSON mode
  try {
    const prompt = plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT);
    const messages = [{ role: "user" as const, content: prompt }];
    const raw = await callTogether(messages, { maxTokens: 512, temperature: 0, jsonMode: true });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] Together AI failed:", (e as Error).message.slice(0, 80));
  }

  // 3. OpenRouter — JSON mode fallback
  try {
    const prompt = plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT);
    const messages = [{ role: "user" as const, content: prompt }];
    const raw = await callOpenRouter(messages, { maxTokens: 512, temperature: 0, jsonMode: true });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] OpenRouter failed:", (e as Error).message.slice(0, 80));
  }

  // 4. Gemini — fallback
  try {
    const prompt = plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT);
    const messages = [{ role: "user" as const, content: prompt }];
    const raw = await callGoogle(messages, { maxTokens: 512, temperature: 0 });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] Gemini failed:", (e as Error).message.slice(0, 80));
  }

  // 5. HuggingFace — last resort
  try {
    const prompt = plannerPrompt(intent, userInput, contextSummary, TOOL_SCHEMA_TEXT);
    const messages = [{ role: "user" as const, content: prompt }];
    const raw = await callHuggingFace(messages, { maxTokens: 512, temperature: 0 });
    const toolCalls = parseToolCalls(raw);
    if (toolCalls.length > 0) return { tool_calls: toolCalls };
  } catch (e) {
    console.warn("[Planner] HuggingFace failed:", (e as Error).message.slice(0, 80));
  }

  return { tool_calls: [] };
}
