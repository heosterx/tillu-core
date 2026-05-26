import { config } from "../../config";

const BASE_URL = "https://api.cerebras.ai/v1";
const MODEL = "llama-3.3-70b";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Call Cerebras llama-3.3-70b — primary classifier.
 * Fastest free inference available. Used for Stage 1 classification.
 */
export async function callCerebras(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const key = config.llm.cerebrasKey;
  if (!key) throw new Error("CEREBRAS_API_KEY not set");

  const body: Record<string, unknown> = {
    model: MODEL,
    messages,
    max_tokens: options?.maxTokens ?? 512,
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
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cerebras error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned empty response");
  return text;
}
