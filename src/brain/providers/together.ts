import { config } from "../../config";
import type { ChatMessage } from "./cerebras";

const BASE_URL = "https://api.together.xyz/v1";

/**
 * Together AI free models (as of 2025):
 * - meta-llama/Llama-3.3-70B-Instruct-Turbo-Free
 * - meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo  (vision capable)
 * - deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free
 * - Qwen/Qwen2.5-72B-Instruct-Turbo-Free
 *
 * Uses OpenAI-compatible API format.
 */
export const TOGETHER_FREE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
  "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
  "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free",
  "Qwen/Qwen2.5-72B-Instruct-Turbo-Free",
] as const;

export type TogetherModel = typeof TOGETHER_FREE_MODELS[number];

export async function callTogether(
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    model?: string;
  }
): Promise<string> {
  const key = config.llm.togetherKey;
  if (!key) throw new Error("TOGETHER_AI_API_KEY not set");

  const model = options?.model ?? config.llm.togetherModel;

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.1,
    stream: false,
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
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Together AI error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Together AI returned empty response");
  return text;
}

/**
 * Verify Together AI key is working.
 */
export async function verifyTogether(): Promise<{
  ok: boolean;
  model: string;
  latency_ms: number;
  error?: string;
}> {
  const key = config.llm.togetherKey;
  const model = config.llm.togetherModel;

  if (!key) return { ok: false, model, latency_ms: 0, error: "TOGETHER_AI_API_KEY not set" };

  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, model, latency_ms: Date.now() - start, error: `${res.status}: ${err.slice(0, 80)}` };
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const reply = data.choices?.[0]?.message?.content ?? "";
    return { ok: !!reply, model, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, model, latency_ms: Date.now() - start, error: (e as Error).message.slice(0, 80) };
  }
}
