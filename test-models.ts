/**
 * test-models.ts — Retry only previously FAILED models
 *
 * PASSING (skip these — confirmed working):
 *   groq: allam-2-7b, meta-llama/llama-4-scout-17b-16e-instruct,
 *         llama-3.1-8b-instant, llama-3.3-70b-versatile,
 *         qwen/qwen3-32b, groq/compound-mini
 *   openrouter: google/gemma-4-31b-it:free
 *
 * Run: npx tsx test-models.ts
 */

import dotenv from "dotenv";
dotenv.config();

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m",
};

const ok   = (m: string) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const fail = (m: string) => console.log(`  ${C.red}✗${C.reset} ${m}`);
const warn = (m: string) => console.log(`  ${C.yellow}⚠${C.reset} ${m}`);
const head = (m: string) => console.log(`\n${C.bold}${C.blue}${m}${C.reset}`);
const sub  = (m: string) => console.log(`\n  ${C.bold}${C.magenta}${m}${C.reset}`);
const dim  = (m: string) => console.log(`${C.dim}    ${m}${C.reset}`);
const ms   = (n: number) => n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`;

interface ModelResult {
  provider: string; model: string; ok: boolean;
  latency_ms: number; reply?: string; error?: string;
}
const results: ModelResult[] = [];

// ─── Shared HTTP caller ───────────────────────────────────────────────────────

const PROMPT = [{ role: "user" as const, content: "Reply with exactly 5 words: Tillu is always ready Heoster" }];

async function call(
  baseUrl: string, apiKey: string, model: string,
  headers: Record<string, string> = {}, timeoutMs = 25000
): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model, messages: PROMPT, max_tokens: 30, temperature: 0, stream: false }),
      signal: ctrl.signal,
    });
    if (!res.ok) { const e = await res.text(); throw new Error(`HTTP ${res.status}: ${e.slice(0, 100)}`); }
    const d = await res.json() as { choices: Array<{ message?: { content?: string | null; reasoning_content?: string; reasoning?: string }; text?: string }> };
    const c = d.choices?.[0];
    const text = c?.message?.content || c?.message?.reasoning_content || c?.message?.reasoning || c?.text || "";
    if (!text) throw new Error("Empty response");
    return text;
  } finally { clearTimeout(t); }
}

async function callCerebrasRaw(key: string, model: string): Promise<string> {
  // Cerebras reasoning models (zai-glm-4.7, gpt-oss-120b) need higher token limit
  // and return output in message.reasoning when thinking, message.content when done
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: PROMPT,
        max_tokens: 200,   // enough to finish reasoning + produce content
        temperature: 0,
        stream: false,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) { const e = await res.text(); throw new Error(`HTTP ${res.status}: ${e.slice(0, 100)}`); }
    const d = await res.json() as {
      choices: Array<{
        finish_reason: string;
        message?: { content?: string | null; reasoning?: string; reasoning_content?: string }
      }>
    };
    const msg = d.choices?.[0]?.message;
    const text = msg?.content || msg?.reasoning_content || msg?.reasoning || "";
    if (!text) throw new Error(`Empty — finish_reason=${d.choices?.[0]?.finish_reason}, keys=${Object.keys(msg ?? {}).join(",")}`);
    return text;
  } finally { clearTimeout(t); }
}

async function test(provider: string, model: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const reply = await fn();
    const lat = Date.now() - start;
    ok(`${model.padEnd(58)} ${C.dim}${ms(lat)}${C.reset}  "${reply.trim().slice(0, 55)}"`);
    results.push({ provider, model, ok: true, latency_ms: lat, reply: reply.trim().slice(0, 55) });
  } catch (e) {
    const lat = Date.now() - start;
    const err = (e as Error).message.slice(0, 80);
    fail(`${model.padEnd(58)} ${C.dim}${ms(lat)}${C.reset}  ${C.red}${err}${C.reset}`);
    results.push({ provider, model, ok: false, latency_ms: lat, error: err });
  }
}

// ─── 1. CEREBRAS — both models returned "Empty response" ─────────────────────
// Root cause: reasoning models return content differently. Fixed in caller above.

async function retryCerebras(): Promise<void> {
  head("── 1. CEREBRAS  (previously: Empty response — reasoning field fix + higher tokens)");
  const key = process.env.CEREBRAS_API_KEY ?? "";
  if (!key) { warn("CEREBRAS_API_KEY not set — skipping"); return; }

  // These are reasoning models — content lives in message.reasoning until thinking is done
  // Need max_tokens >= 200 to get past the thinking phase into actual content
  const models = ["zai-glm-4.7", "gpt-oss-120b"];
  for (const m of models) {
    await test("cerebras", m, () => callCerebrasRaw(key, m));
  }
}

// ─── 2. GROQ — only the 3 that failed ────────────────────────────────────────
// openai/gpt-oss-120b → Empty response (reasoning model, fixed in caller)
// openai/gpt-oss-20b  → Empty response (same)
// groq/compound       → 429 rate limit (retry)

async function retryGroq(): Promise<void> {
  head("── 2. GROQ  (previously: GPT-OSS Empty response — reasoning fix + higher tokens)");
  const key = process.env.GROQ_API_KEY ?? "";
  if (!key) { warn("GROQ_API_KEY not set — skipping"); return; }

  // groq/compound already passing — skip it
  // GPT-OSS models are reasoning models, need higher max_tokens
  const reasoningModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
  for (const m of reasoningModels) {
    await test("groq", m, () => {
      // Use same raw approach: higher tokens, check reasoning field
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      return fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: m, messages: PROMPT, max_tokens: 200, temperature: 0, stream: false }),
        signal: ctrl.signal,
      }).then(async r => {
        clearTimeout(t);
        if (!r.ok) { const e = await r.text(); throw new Error(`HTTP ${r.status}: ${e.slice(0, 100)}`); }
        const d = await r.json() as { choices: Array<{ message?: { content?: string | null; reasoning?: string; reasoning_content?: string } }> };
        const msg = d.choices?.[0]?.message;
        const text = msg?.content || msg?.reasoning_content || msg?.reasoning || "";
        if (!text) throw new Error(`Empty — keys=${Object.keys(msg ?? {}).join(",")}`);
        return text;
      }).catch(e => { clearTimeout(t); throw e; });
    });
  }
}

// ─── 3. OPENROUTER — 404s (models removed) + 429s (rate limit) ───────────────
// 404 = model no longer has free endpoints → skip those, retry 429s only
// Also test newly discovered free models from the live API list

async function retryOpenRouter(): Promise<void> {
  head("── 3. OPENROUTER  (previously: 429s + 404s)");
  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (!key) { warn("OPENROUTER_API_KEY not set — skipping"); return; }

  const h = { "HTTP-Referer": "https://tillu-core.onrender.com", "X-Title": "Tillu-Core" };

  // Fetch fresh free model list — may have changed since last run
  sub("Fetching current free models from API...");
  let freshFree: string[] = [];
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    });
    const d = await res.json() as { data: Array<{ id: string; pricing: { prompt: string } }> };
    freshFree = (d.data ?? [])
      .filter(m => m.pricing?.prompt === "0" || m.id.endsWith(":free"))
      .map(m => m.id)
      .sort();
    dim(`Free models available now: ${freshFree.length}`);
  } catch (e) {
    warn(`Could not fetch fresh list: ${(e as Error).message.slice(0, 50)}`);
  }

  // Previously 429 (rate limit — retry now):
  const retry429 = [
    "meta-llama/llama-3.3-70b-instruct:free",
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    "google/gemma-4-26b-a4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "minimax/minimax-m2.5:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
  ];

  // Skip permanently dead/wrong-type models:
  const skip = new Set([
    "deepseek/deepseek-v4-flash:free",          // 404 — no endpoints
    "google/lyria-3-pro-preview",               // 502 — audio model
    "google/lyria-3-clip-preview",              // audio model
    "liquid/lfm-2.5-1.2b-thinking:free",        // empty — thinking-only, no content field
    "nvidia/nemotron-3-nano-30b-a3b:free",      // empty — check later
    "google/gemma-4-31b-it:free",               // already passing
    "liquid/lfm-2.5-1.2b-instruct:free",        // already passing
    "moonshotai/kimi-k2.6:free",                // already passing
  ]);

  // New models from fresh list not tested before (excluding skip list):
  const newModels = freshFree.filter(m => !new Set([...retry429, ...skip]).has(m));
  if (newModels.length) dim(`New free models to test: ${newModels.join(", ")}`);

  const toTest = [...retry429, ...newModels].filter(m => !skip.has(m));

  sub(`Testing ${toTest.length} models:`);
  for (const m of toTest) {
    await test("openrouter", m, () => call("https://openrouter.ai/api/v1", key, m, h, 30000));
  }
}

// ─── 4. TOGETHER AI — all 402 (out of credits) ───────────────────────────────
// The "-Free" suffix models are truly free (no credits). The API list returned
// ALL models (not just free ones) — our filter was wrong last time.
// Fixed: only test models whose ID ends in "-Free".

async function retryTogether(): Promise<void> {
  head("── 4. TOGETHER AI  (previously: all 402 — credits exhausted)");
  const key = process.env.TOGETHER_AI_API_KEY ?? "";
  if (!key) { warn("TOGETHER_AI_API_KEY not set — skipping"); return; }

  // Fetch live list, filter ONLY truly free models (end in "-Free")
  sub("Fetching truly-free models (ending in -Free)...");
  let freeModels: string[] = [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch("https://api.together.xyz/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const d = await res.json() as Array<{ id: string; type?: string }>;
    freeModels = (Array.isArray(d) ? d : [])
      .filter(m => m.id.endsWith("-Free"))
      .map(m => m.id)
      .sort();
    dim(`Truly-free models found: ${freeModels.length}`);
    freeModels.forEach(m => dim(`  ${m}`));
  } catch (e) {
    warn(`Could not fetch model list: ${(e as Error).message.slice(0, 60)}`);
  }

  // Fallback known free models if API call failed
  if (freeModels.length === 0) {
    freeModels = [
      "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
      "deepseek-ai/DeepSeek-R1-Distill-Llama-70B-Free",
      "Qwen/Qwen2.5-72B-Instruct-Turbo-Free",
    ];
    dim("Using fallback known free models");
  }

  sub(`Testing ${freeModels.length} free models:`);
  for (const m of freeModels) {
    await test("together", m, () => call("https://api.together.xyz/v1", key, m, {}, 30000));
  }
}

// ─── 5. HUGGINGFACE — all "fetch failed" (Windows SSL / AbortSignal issue) ───
// Root cause: AbortSignal.timeout() has issues on some Node versions on Windows.
// Fixed: using manual AbortController + setTimeout in the call() helper above.

async function retryHuggingFace(): Promise<void> {
  head("── 5. HUGGINGFACE  (previously: all 'fetch failed' — AbortSignal bug)");
  const key = process.env.HF_API_KEY ?? "";
  if (!key) { warn("HF_API_KEY not set — skipping"); return; }

  // Well-known free serverless inference models
  const models = [
    "Qwen/Qwen2.5-72B-Instruct",
    "Qwen/Qwen3-30B-A3B",
    "meta-llama/Llama-3.3-70B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
    "mistralai/Mixtral-8x7B-Instruct-v0.1",
    "microsoft/Phi-3.5-mini-instruct",
    "google/gemma-2-9b-it",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B",
    "HuggingFaceH4/zephyr-7b-beta",
  ];

  sub(`Testing ${models.length} models:`);
  for (const m of models) {
    await test("huggingface", m, () =>
      call("https://api-inference.huggingface.co/v1", key, m, {}, 35000)
    );
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(totalMs: number): void {
  head("── SUMMARY ─────────────────────────────────────────────────────────────");

  const byProvider: Record<string, ModelResult[]> = {};
  for (const r of results) (byProvider[r.provider] ??= []).push(r);

  let totalOk = 0, totalFail = 0;
  for (const [prov, rs] of Object.entries(byProvider)) {
    const passed = rs.filter(r => r.ok);
    const failed = rs.filter(r => !r.ok);
    totalOk += passed.length; totalFail += failed.length;
    console.log(`\n  ${C.bold}${prov.toUpperCase()}${C.reset}  ${C.green}${passed.length} newly passing${C.reset}  ${failed.length > 0 ? C.red : C.dim}${failed.length} still failing${C.reset}`);
    for (const p of passed) console.log(`  ${C.green}  ✓ ${p.model}${C.reset}  ${C.dim}${ms(p.latency_ms)}${C.reset}`);
    for (const f of failed) console.log(`  ${C.red}  ✗ ${f.model}${C.reset}  ${C.dim}${f.error?.slice(0, 70)}${C.reset}`);
  }

  console.log(`\n  ${C.bold}Newly passing: ${C.green}${totalOk}${C.reset}  Still failing: ${totalFail > 0 ? C.red : ""}${totalFail}${C.reset}`);

  if (totalOk > 0) {
    console.log(`\n${C.bold}${C.cyan}── NOW WORKING (add to tillu-core providers) ────────────────────────${C.reset}`);
    const working = results.filter(r => r.ok).sort((a, b) => a.latency_ms - b.latency_ms);
    for (const r of working) {
      console.log(`  ${r.provider.padEnd(14)} ${r.model.padEnd(58)} ${C.green}${ms(r.latency_ms)}${C.reset}`);
    }
  }

  console.log(`\n${C.dim}  Total time: ${ms(totalMs)}${C.reset}\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     TILLU — Retry Failed Models Only                        ║`);
  console.log(`║     Skipping 7 already-passing models                       ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Already passing (skipped): Groq×6, OpenRouter google/gemma-4-31b-it:free${C.reset}`);

  const start = Date.now();
  await retryCerebras();
  await retryGroq();
  await retryOpenRouter();
  await retryTogether();
  await retryHuggingFace();
  printSummary(Date.now() - start);
}

main().catch(e => { console.error(`\n${C.red}Fatal:${C.reset}`, e); process.exit(1); });
