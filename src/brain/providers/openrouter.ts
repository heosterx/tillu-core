import { config } from "../../config";
import type { ChatMessage } from "./cerebras";

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Call OpenRouter free tier — tertiary fallback for classifier + planner.
 * Uses OpenAI-compatible API format.
 */
export async function callOpenRouter(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const key = config.llm.openrouterKey;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const body: Record<string, unknown> = {
    model: config.llm.openrouterModel,
    messages,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.1,
  };

  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://tillu-core.onrender.com",
      "X-Title": "Tillu-Core",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content;
  if (!text) throw new Error("OpenRouter returned empty response");
  return text;
}
