import { config } from "../../config";

const BASE_URL = "https://api.cerebras.ai/v1";

// Available Cerebras models (as of 2025)
export const CEREBRAS_MODELS = [
  "llama-3.3-70b",
  "llama-4-scout-17b-16e-instruct",
  "llama3.1-8b",
] as const;

export type CerebrasModel = typeof CEREBRAS_MODELS[number];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function getModel(): string {
  const model = config.llm.cerebrasModel;
  if (!CEREBRAS_MODELS.includes(model as CerebrasModel)) {
    console.warn(
      `[Cerebras] Unknown model "${model}". Valid models: ${CEREBRAS_MODELS.join(", ")}. Falling back to llama-3.3-70b.`
    );
    return "llama-3.3-70b";
  }
  return model;
}

/**
 * Call Cerebras — primary classifier.
 * Fastest free inference available. Used for Stage 1 classification.
 * Model configurable via CEREBRAS_MODEL env var (default: llama-3.3-70b).
 */
export async function callCerebras(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const key = config.llm.cerebrasKey;
  if (!key) throw new Error("CEREBRAS_API_KEY not set");

  const model = getModel();

  const body: Record<string, unknown> = {
    model,
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

/**
 * Verify Cerebras API key and model are working.
 * Called at startup and exposed via /health.
 */
export async function verifyCerebras(): Promise<{
  ok: boolean;
  model: string;
  latency_ms: number;
  error?: string;
}> {
  const key = config.llm.cerebrasKey;
  if (!key) {
    return { ok: false, model: config.llm.cerebrasModel, latency_ms: 0, error: "CEREBRAS_API_KEY not set" };
  }

  const model = getModel();
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
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, model, latency_ms: Date.now() - start, error: `${res.status}: ${err.slice(0, 100)}` };
    }

    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    const reply = data.choices[0]?.message?.content ?? "";

    return { ok: true, model, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, model, latency_ms: Date.now() - start, error: (e as Error).message };
  }
}
