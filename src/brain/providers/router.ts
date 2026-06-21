/**
 * router.ts — Load-balanced LLM provider router
 *
 * Manages all confirmed-working free models across 3 providers.
 * Strategy:
 *   - Round-robin across providers (equal load distribution)
 *   - If a provider fails → cooldown → next provider takes over
 *   - Reasoning models (GPT-OSS, Qwen3, GLM, Nemotron) handled transparently
 *   - Each stage (classifier, planner, writer) gets its own pool
 *   - Deprecated Groq models moved to fallback-only positions
 */

import { config } from "../../config";
import type { ChatMessage } from "./cerebras";
import Groq from "groq-sdk";

// ─── Confirmed working models from test suite ─────────────────────────────────

export const WORKING_MODELS = {
  groq: [
    // ✔ Active & recommended
    "openai/gpt-oss-20b",                       // 232ms  — reasoning, primary planner
    "qwen/qwen3.6-27b",                         // ~350ms — strong reasoning (new June 2025)
    "allam-2-7b",                               // 99ms   — fastest, classifier
    "groq/compound-mini",                       // 751ms  — agentic, has built-in tools
    "groq/compound",                            // 2.1s   — full agentic system
    "openai/gpt-oss-120b",                      // 2.1s   — largest, best quality
    // ⚠ Deprecated / scheduled for removal — fallback only
    "llama-3.3-70b-versatile",                  // DEPRECATED by Groq
    "llama-3.1-8b-instant",                     // DEPRECATED by Groq
    "qwen/qwen3-32b",                           // DEPRECATED by Groq
    "meta-llama/llama-4-scout-17b-16e-instruct",// DEPRECATED by Groq
  ],
  cerebras: [
    "gpt-oss-120b",                             // 437ms  — reasoning model
    "zai-glm-4.7",                              // 748ms  — GLM reasoning model
  ],
  openrouter: [
    "poolside/laguna-xs.2:free",                // 785ms
    "nvidia/nemotron-3-super-120b-a12b:free",   // 855ms
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // 958ms
    "liquid/lfm-2.5-1.2b-instruct:free",        // 584ms  — fastest OR model
    "google/gemma-4-31b-it:free",               // 1.5s
    "nvidia/nemotron-nano-9b-v2:free",          // 1.9s
    "z-ai/glm-4.5-air:free",                    // 1.9s
    "openrouter/owl-alpha",                     // 2.5s
    "openai/gpt-oss-120b:free",                 // 4.3s   — free GPT-OSS via OR
  ],
} as const;

/**
 * Strip reasoning preamble from models that think out loud before answering.
 * Handles both XML <think>...</think> tags (Qwen3) and numbered analysis steps.
 */
function stripReasoningPreamble(text: string): string {
  let t = text.trim();

  // Pattern 0: <think>...</think> XML block (Qwen3, DeepSeek-R1 style)
  t = t.replace(/^<think>[\s\S]*?<\/think>\s*/i, "").trim();

  // Pattern 1: "1. **Analyze the Request:**..." — numbered analysis preamble
  if (/^1\.\s+\*\*/.test(t)) {
    // Try to find explicit "Response:" section
    const responseMatch = t.match(/\*\*(?:Response|Final Response|Output|Answer)[:\s*]+\*\*\s*([\s\S]+?)(?:\n\n\d+\.|$)/i);
    if (responseMatch?.[1]?.trim()) return responseMatch[1].trim();

    // Fallback: last non-empty paragraph that isn't a numbered step
    const paragraphs = t.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
    const last = paragraphs[paragraphs.length - 1] ?? t;
    if (!/^\d+\.\s+\*\*/.test(last)) return last;
  }

  // Pattern 2: "We are initiating a conversation..." — proactive preamble
  if (/^We are (initiating|given|asked)/i.test(t)) {
    const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
    const msgLine = lines.find(l =>
      !l.startsWith("We are") && !l.startsWith("The ") &&
      !l.startsWith("*") && l.length > 10
    );
    if (msgLine) return msgLine;
  }

  return t;
}

// ─── Reasoning models — content lives in message.reasoning, not message.content

const REASONING_MODELS = new Set([
  "openai/gpt-oss-120b", "openai/gpt-oss-20b",   // Groq GPT-OSS
  "qwen/qwen3.6-27b", "qwen/qwen3-32b",          // Groq Qwen3 (think tags)
  "gpt-oss-120b",                                  // Cerebras GPT-OSS
  "zai-glm-4.7",                                   // Cerebras GLM
  "openai/gpt-oss-120b:free",                      // OpenRouter GPT-OSS
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "z-ai/glm-4.5-air:free",
  "groq/compound", "groq/compound-mini",
]);

// ─── Provider health tracker ──────────────────────────────────────────────────

interface ProviderHealth {
  failures: number;
  lastFailure: number;
  lastUsed: number;
  totalCalls: number;
  totalFailures: number;
}

const COOLDOWN_MS = 60_000;   // 1 min cooldown after failure
const MAX_FAILURES = 3;       // failures before cooldown kicks in

const health: Record<string, ProviderHealth> = {
  groq:       { failures: 0, lastFailure: 0, lastUsed: 0, totalCalls: 0, totalFailures: 0 },
  cerebras:   { failures: 0, lastFailure: 0, lastUsed: 0, totalCalls: 0, totalFailures: 0 },
  openrouter: { failures: 0, lastFailure: 0, lastUsed: 0, totalCalls: 0, totalFailures: 0 },
};

function isOnCooldown(provider: string): boolean {
  const h = health[provider];
  if (!h) return false;
  if (h.failures < MAX_FAILURES) return false;
  return Date.now() - h.lastFailure < COOLDOWN_MS;
}

function recordSuccess(provider: string): void {
  const h = health[provider];
  if (!h) return;
  h.failures = 0;
  h.lastUsed = Date.now();
  h.totalCalls++;
}

function recordFailure(provider: string): void {
  const h = health[provider];
  if (!h) return;
  h.failures++;
  h.lastFailure = Date.now();
  h.totalCalls++;
  h.totalFailures++;
}

/** Get providers sorted by least-recently-used (round-robin effect) */
function getProviderOrder(): string[] {
  return Object.entries(health)
    .filter(([p]) => !isOnCooldown(p))
    .sort(([, a], [, b]) => a.lastUsed - b.lastUsed)
    .map(([p]) => p);
}

export function getHealthStatus(): Record<string, {
  ok: boolean; cooldown: boolean; calls: number; failures: number; failRate: string;
}> {
  return Object.fromEntries(
    Object.entries(health).map(([p, h]) => [p, {
      ok: !isOnCooldown(p),
      cooldown: isOnCooldown(p),
      calls: h.totalCalls,
      failures: h.totalFailures,
      failRate: h.totalCalls > 0 ? `${((h.totalFailures / h.totalCalls) * 100).toFixed(0)}%` : "0%",
    }])
  );
}

// ─── Core HTTP caller ─────────────────────────────────────────────────────────

async function callHTTP(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean },
  extraHeaders: Record<string, string> = {},
  timeoutMs = 20000
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  const isReasoning = REASONING_MODELS.has(model);
  // Reasoning models need more tokens to finish thinking before producing content
  const maxTokens = isReasoning
    ? Math.max(options.maxTokens ?? 512, 512)
    : (options.maxTokens ?? 512);

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: options.temperature ?? 0.1,
    stream: false,
  };

  if (options.jsonMode && !isReasoning) {
    body.response_format = { type: "json_object" };
  }

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status}: ${err.slice(0, 120)}`);
    }

    const data = await res.json() as {
      choices: Array<{
        message?: {
          content?: string | null;
          reasoning?: string;
          reasoning_content?: string;
          tool_calls?: Array<{ function: { name: string; arguments: string } }>;
        };
        text?: string;
      }>;
    };

    const choice = data.choices?.[0];

    // Tool calls (Groq function calling)
    if (choice?.message?.tool_calls?.length) {
      return JSON.stringify(
        choice.message.tool_calls.map(tc => ({
          tool: tc.function.name,
          params: JSON.parse(tc.function.arguments ?? "{}"),
        }))
      );
    }

    // Standard content or reasoning fallback
    const rawText =
      choice?.message?.content ||
      choice?.message?.reasoning_content ||
      choice?.message?.reasoning ||
      choice?.text ||
      "";

    if (!rawText) throw new Error("Empty response");

    // Strip reasoning preamble from models that think out loud before answering.
    // Pattern: numbered analysis steps before the actual response.
    const text = stripReasoningPreamble(rawText);
    return text;
  } finally {
    clearTimeout(t);
  }
}

// ─── Per-provider callers ─────────────────────────────────────────────────────

let _groqClient: Groq | null = null;

async function callGroqProvider(
  model: string,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean; tools?: Groq.Chat.CompletionCreateParams.Tool[] }
): Promise<string> {
  const key = config.llm.groqKey;
  if (!key) throw new Error("GROQ_API_KEY not set");

  // Use SDK for function calling, HTTP for everything else
  if (options.tools?.length) {
    if (!_groqClient) _groqClient = new Groq({ apiKey: key });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = {
      model,
      messages,
      max_tokens: options.maxTokens ?? 512,
      temperature: options.temperature ?? 0.1,
      stream: false,
      tools: options.tools,
      tool_choice: "auto",
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const completion = await (_groqClient.chat.completions.create(req) as Promise<any>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const choice = completion.choices?.[0] as any;
    if (choice?.message?.tool_calls?.length) {
      return JSON.stringify(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        choice.message.tool_calls.map((tc: any) => ({
          tool: tc.function?.name ?? "",
          params: JSON.parse(tc.function?.arguments ?? "{}"),
        }))
      );
    }
    const text = choice?.message?.content as string | undefined;
    if (!text) throw new Error("Groq returned empty response");
    return text;
  }

  return callHTTP("https://api.groq.com/openai/v1", key, model, messages, options, {}, 20000);
}

async function callCerebrasProvider(
  model: string,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const key = config.llm.cerebrasKey;
  if (!key) throw new Error("CEREBRAS_API_KEY not set");
  return callHTTP("https://api.cerebras.ai/v1", key, model, messages, options, {}, 15000);
}

async function callOpenRouterProvider(
  model: string,
  messages: ChatMessage[],
  options: { maxTokens?: number; temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const key = config.llm.openrouterKey;
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  return callHTTP(
    "https://openrouter.ai/api/v1", key, model, messages, options,
    { "HTTP-Referer": "https://tillu-core.onrender.com", "X-Title": "Tillu-Core" },
    25000
  );
}

// ─── Model pools per stage ────────────────────────────────────────────────────

/**
 * Classifier pool — fast models, JSON mode, ~200ms target
 * Ordered: active non-deprecated first, deprecated fallback last
 */
const CLASSIFIER_POOL: Array<{ provider: string; model: string }> = [
  { provider: "groq",       model: "allam-2-7b" },           // 99ms  — fastest active
  { provider: "cerebras",   model: "gpt-oss-120b" },
  { provider: "openrouter", model: "liquid/lfm-2.5-1.2b-instruct:free" },
  { provider: "groq",       model: "openai/gpt-oss-20b" },   // reasoning but fast
  { provider: "cerebras",   model: "zai-glm-4.7" },
  { provider: "openrouter", model: "poolside/laguna-xs.2:free" },
  // deprecated fallbacks
  { provider: "groq",       model: "llama-3.1-8b-instant" },
  { provider: "groq",       model: "llama-3.3-70b-versatile" },
];

/**
 * Planner pool — structured output, function calling preferred
 * Non-deprecated models first; deprecated Groq models as last resort
 */
const PLANNER_POOL: Array<{ provider: string; model: string }> = [
  { provider: "groq",       model: "openai/gpt-oss-20b" },       // primary planner
  { provider: "groq",       model: "qwen/qwen3.6-27b" },         // strong reasoning (new)
  { provider: "cerebras",   model: "gpt-oss-120b" },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { provider: "cerebras",   model: "zai-glm-4.7" },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
  { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
  // deprecated fallbacks
  { provider: "groq",       model: "llama-3.3-70b-versatile" },
  { provider: "groq",       model: "qwen/qwen3-32b" },
];

/**
 * Writer pool — quality, warmth, Hindi/English mix
 * Non-deprecated models first; deprecated Groq models as last resort
 */
const WRITER_POOL: Array<{ provider: string; model: string }> = [
  { provider: "groq",       model: "openai/gpt-oss-120b" },      // best quality
  { provider: "groq",       model: "qwen/qwen3.6-27b" },         // strong writer (new)
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { provider: "cerebras",   model: "gpt-oss-120b" },
  { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
  { provider: "openrouter", model: "z-ai/glm-4.5-air:free" },
  { provider: "cerebras",   model: "zai-glm-4.7" },
  { provider: "openrouter", model: "openrouter/owl-alpha" },
  // deprecated fallbacks
  { provider: "groq",       model: "llama-3.3-70b-versatile" },
  { provider: "groq",       model: "meta-llama/llama-4-scout-17b-16e-instruct" },
  { provider: "groq",       model: "qwen/qwen3-32b" },
];

// ─── Main router function ─────────────────────────────────────────────────────

export interface RouterOptions {
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  tools?: Groq.Chat.CompletionCreateParams.Tool[];
}

async function callWithPool(
  pool: Array<{ provider: string; model: string }>,
  messages: ChatMessage[],
  options: RouterOptions,
  stageName: string
): Promise<string> {
  // Sort pool: available providers first, ordered by least-recently-used
  const providerOrder = getProviderOrder();
  const sorted = [
    ...pool.filter(e => providerOrder.includes(e.provider))
           .sort((a, b) => providerOrder.indexOf(a.provider) - providerOrder.indexOf(b.provider)),
    ...pool.filter(e => !providerOrder.includes(e.provider)), // on-cooldown providers last
  ];

  const errors: string[] = [];

  for (const { provider, model } of sorted) {
    if (isOnCooldown(provider)) {
      errors.push(`[${provider}/${model}] on cooldown`);
      continue;
    }

    try {
      let result: string;

      if (provider === "groq") {
        result = await callGroqProvider(model, messages, options);
      } else if (provider === "cerebras") {
        result = await callCerebrasProvider(model, messages, options);
      } else {
        result = await callOpenRouterProvider(model, messages, options);
      }

      recordSuccess(provider);
      console.log(`[Router/${stageName}] ${provider}/${model} ✓`);
      return result;

    } catch (e) {
      const msg = (e as Error).message.slice(0, 80);
      errors.push(`[${provider}/${model}] ${msg}`);
      recordFailure(provider);
      console.warn(`[Router/${stageName}] ${provider}/${model} failed: ${msg}`);
    }
  }

  throw new Error(`[Router/${stageName}] All providers failed:\n${errors.join("\n")}`);
}

// ─── Public stage functions ───────────────────────────────────────────────────

/** Stage 1: Classify — fast, JSON output */
export async function routeClassifier(
  messages: ChatMessage[],
  options?: RouterOptions
): Promise<string> {
  return callWithPool(CLASSIFIER_POOL, messages, { maxTokens: 128, temperature: 0, jsonMode: true, ...options }, "Classifier");
}

/** Stage 2: Plan — structured tool calls */
export async function routePlanner(
  messages: ChatMessage[],
  options?: RouterOptions
): Promise<string> {
  return callWithPool(PLANNER_POOL, messages, { maxTokens: 512, temperature: 0, ...options }, "Planner");
}

/** Stage 3: Write — quality, warm, personal */
export async function routeWriter(
  messages: ChatMessage[],
  options?: RouterOptions
): Promise<string> {
  return callWithPool(WRITER_POOL, messages, { maxTokens: 256, temperature: 0.7, ...options }, "Writer");
}
