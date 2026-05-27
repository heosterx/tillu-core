import { config } from "../../config";

const BASE_URL = "https://api.cerebras.ai/v1";

/**
 * Cerebras free models (as of 2025):
 *   GLM-4-9B  — free via OSSZ.ai on Cerebras, fast inference
 *
 * Paid models (not available on free tier):
 *   llama-3.3-70b, llama-4-scout-17b-16e-instruct, llama3.1-8b
 */
export const CEREBRAS_MODELS = [
  "GLM-4-9B",
] as const;

export const CEREBRAS_DEFAULT_MODEL = "GLM-4-9B";

export type CerebrasModel = typeof CEREBRAS_MODELS[number];

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function getModel(): string {
  const model = config.llm.cerebrasModel;
  if (!CEREBRAS_MODELS.includes(model as CerebrasModel)) {
    console.warn(
      `[Cerebras] Unknown model "${model}". Free model is: ${CEREBRAS_DEFAULT_MODEL}. Falling back.`
    );
    return CEREBRAS_DEFAULT_MODEL;
  }
  return model;
}

/**
 * Call Cerebras GLM-4-9B — primary classifier.
 * Fastest free inference. Used for Stage 1 classification.
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
    throw new Error(`Cerebras error ${res.status}: ${err.slice(0, 120)}`);
  }

  const data = await res.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Cerebras returned empty response");
  return text;
}

/**
 * Verify Cerebras API key and model are working.
 */
export async function verifyCerebras(): Promise<{
  ok: boolean;
  model: string;
  latency_ms: number;
  error?: string;
}> {
  const key = config.llm.cerebrasKey;
  if (!key) {
    return { ok: false, model: CEREBRAS_DEFAULT_MODEL, latency_ms: 0, error: "CEREBRAS_API_KEY not set" };
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
    const reply = data.choices?.[0]?.message?.content ?? "";
    return { ok: !!reply, model, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, model, latency_ms: Date.now() - start, error: (e as Error).message.slice(0, 80) };
  }
}
