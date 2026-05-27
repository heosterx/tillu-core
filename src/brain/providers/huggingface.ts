import { config } from "../../config";
import type { ChatMessage } from "./cerebras";

const BASE_URL = "https://router.huggingface.co/v1";

/**
 * Call HuggingFace Inference API — last resort fallback.
 * Uses OpenAI-compatible chat completions endpoint via router.
 */
export async function callHuggingFace(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const key = config.llm.hfKey;
  if (!key) throw new Error("HF_API_KEY not set");

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.llm.hfModel,
      messages,
      max_tokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HuggingFace error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices[0]?.message?.content;
  if (!text) throw new Error("HuggingFace returned empty response");
  return text;
}
