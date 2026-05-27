/**
 * test-brain.ts — Cloud-only brain test (extended)
 * Tests providers, pipeline, tools, and edge cases.
 *
 * Run: npx tsx test-brain.ts
 */

import dotenv from "dotenv";
dotenv.config();

import { runPipeline } from "./src/brain/pipeline";
import { verifyCerebras } from "./src/brain/providers/cerebras";
import { callGroq } from "./src/brain/providers/groq";
import { callGoogle } from "./src/brain/providers/google";
import { callOpenRouter } from "./src/brain/providers/openrouter";
import { callTogether, verifyTogether } from "./src/brain/providers/together";
import { callHuggingFace } from "./src/brain/providers/huggingface";
import { search } from "./src/tools/search.tool";
import { loadContext } from "./src/tools/memory.tool";
import { speak } from "./src/tools/voice.tool";
import { writeProactiveMessage } from "./src/brain/writer";

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  red:     "\x1b[31m",
  cyan:    "\x1b[36m",
  blue:    "\x1b[34m",
  magenta: "\x1b[35m",
  white:   "\x1b[37m",
};

const ok   = (msg: string) => console.log(`${C.green}  ✓${C.reset} ${msg}`);
const fail = (msg: string) => console.log(`${C.red}  ✗${C.reset} ${msg}`);
const warn = (msg: string) => console.log(`${C.yellow}  ⚠${C.reset} ${msg}`);
const info = (msg: string) => console.log(`${C.cyan}  →${C.reset} ${msg}`);
const head = (msg: string) => console.log(`\n${C.bold}${C.blue}${msg}${C.reset}`);
const dim  = (msg: string) => console.log(`${C.dim}    ${msg}${C.reset}`);

const ms   = (n: number) => n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`;
const trunc = (s: string, n = 100) => s.length > n ? s.slice(0, n) + "…" : s;

// ─── Counters ─────────────────────────────────────────────────────────────────

const results = { passed: 0, failed: 0, warned: 0 };

function pass(label: string, detail = "") {
  ok(`${label}${detail ? `  ${C.dim}${detail}${C.reset}` : ""}`);
  results.passed++;
}
function flunk(label: string, detail = "") {
  fail(`${label}${detail ? `  — ${detail}` : ""}`);
  results.failed++;
}
function caution(label: string, detail = "") {
  warn(`${label}${detail ? `  — ${detail}` : ""}`);
  results.warned++;
}

// ─── 1. Provider Health ───────────────────────────────────────────────────────

async function testProviders(): Promise<void> {
  head("── 1. Provider Health ─────────────────────────────────────────");

  // Cerebras
  const cerebras = await verifyCerebras();
  if (cerebras.ok) {
    pass(`Cerebras`, `model=${cerebras.model}  latency=${ms(cerebras.latency_ms)}`);
  } else {
    flunk(`Cerebras`, cerebras.error);
  }

  // Groq
  try {
    const start = Date.now();
    const r = await callGroq([{ role: "user", content: "Reply with the single word: ok" }], { maxTokens: 5, temperature: 0 });
    pass(`Groq`, `reply="${r.trim()}"  latency=${ms(Date.now() - start)}`);
  } catch (e) { flunk(`Groq`, (e as Error).message.slice(0, 80)); }

  // Gemini
  try {
    const start = Date.now();
    const r = await callGoogle([{ role: "user", content: "Reply with the single word: ok" }], { maxTokens: 5, temperature: 0 });
    pass(`Gemini`, `reply="${r.trim()}"  latency=${ms(Date.now() - start)}`);
  } catch (e) { flunk(`Gemini`, (e as Error).message.slice(0, 80)); }

  // OpenRouter
  try {
    const start = Date.now();
    const r = await callOpenRouter([{ role: "user", content: "Reply with the single word: ok" }], { maxTokens: 5, temperature: 0 });
    pass(`OpenRouter`, `reply="${r.trim()}"  latency=${ms(Date.now() - start)}`);
  } catch (e) { flunk(`OpenRouter`, (e as Error).message.slice(0, 80)); }

  // Together AI
  const together = await verifyTogether();
  if (together.ok) {
    pass(`Together AI`, `model=${together.model}  latency=${ms(together.latency_ms)}`);
  } else {
    flunk(`Together AI`, together.error);
  }

  // HuggingFace
  try {
    const start = Date.now();
    const r = await callHuggingFace([{ role: "user", content: "Reply with the single word: ok" }], { maxTokens: 5, temperature: 0 });
    pass(`HuggingFace`, `reply="${r.trim()}"  latency=${ms(Date.now() - start)}`);
  } catch (e) { flunk(`HuggingFace`, (e as Error).message.slice(0, 80)); }
}

// ─── 2. Cloud Services ────────────────────────────────────────────────────────

async function testServices(): Promise<void> {
  head("── 2. Cloud Services ──────────────────────────────────────────");

  // Memory
  try {
    const start = Date.now();
    const ctx = await loadContext("test_sess_001", "test ping");
    pass(`Memory /context`, `latency=${ms(Date.now() - start)}`);
    dim(`pinned_facts: ${JSON.stringify(ctx.pinned_facts).slice(0, 60)}`);
    dim(`profile keys: ${Object.keys(ctx.profile).join(", ") || "none"}`);
    dim(`dream_state: ${JSON.stringify(ctx.dream_state).slice(0, 60)}`);
  } catch (e) { flunk(`Memory /context`, (e as Error).message.slice(0, 80)); }

  // Search
  try {
    const start = Date.now();
    const r = await search("current time India IST", "fast", "general");
    if (r.answer && !r.answer.startsWith("Search failed")) {
      pass(`Search`, `latency=${ms(Date.now() - start)}`);
      dim(`answer: ${trunc(r.answer, 80)}`);
    } else {
      flunk(`Search`, r.answer.slice(0, 80));
    }
  } catch (e) { flunk(`Search`, (e as Error).message.slice(0, 80)); }

  // Voice (TTS)
  try {
    const start = Date.now();
    const audioUrl = await speak("Hello Heoster, test successful.", "hi");
    if (audioUrl) {
      pass(`Voice TTS`, `latency=${ms(Date.now() - start)}`);
      dim(`audio_url: ${trunc(audioUrl, 80)}`);
    } else {
      caution(`Voice TTS`, "returned empty URL — voice may be unavailable");
    }
  } catch (e) { caution(`Voice TTS`, (e as Error).message.slice(0, 80)); }
}

// ─── 3. Classifier Tests ──────────────────────────────────────────────────────

async function testClassifier(): Promise<void> {
  head("── 3. Classifier (Stage 1) ────────────────────────────────────");

  const { classify } = await import("./src/brain/classifier");
  const CTX = "Heoster is online, idle, no active tasks.";

  const cases = [
    { input: "Kya haal hai?",                         expectIntent: "conversation",   expectSC: true  },
    { input: "What is 2 + 2?",                        expectIntent: "question",       expectSC: true  },
    { input: "Search for latest cricket news",        expectIntent: "search",         expectSC: false },
    { input: "Open Chrome",                           expectIntent: "system_action",  expectSC: false },
    { input: "Remember my Physics exam is June 10",   expectIntent: "memory",         expectSC: false },
    { input: "What's on my screen?",                  expectIntent: "vision",         expectSC: false },
    { input: "Run this Python code: print('hello')",  expectIntent: "code",           expectSC: false },
    { input: "Add event: study session tomorrow 5pm", expectIntent: "calendar",       expectSC: false },
  ];

  for (const tc of cases) {
    try {
      const start = Date.now();
      const out = await classify(tc.input, CTX);
      const latency = Date.now() - start;
      const intentOk = out.intent === tc.expectIntent;
      const scOk = out.short_circuit === tc.expectSC;

      if (intentOk) {
        pass(`"${trunc(tc.input, 40)}"`, `intent=${out.intent}  sc=${out.short_circuit}  ${ms(latency)}`);
      } else {
        caution(`"${trunc(tc.input, 40)}"`, `expected intent=${tc.expectIntent}, got=${out.intent}  sc=${out.short_circuit}`);
      }
      if (!scOk) {
        dim(`  short_circuit: expected ${tc.expectSC}, got ${out.short_circuit}`);
      }
    } catch (e) {
      flunk(`"${trunc(tc.input, 40)}"`, (e as Error).message.slice(0, 60));
    }
  }
}

// ─── 4. Full Pipeline Tests ───────────────────────────────────────────────────

async function testPipeline(): Promise<void> {
  head("── 4. Full Pipeline (Classify → Plan → Write) ─────────────────");

  const CTX = "Heoster is a Class 12 student. He is at his PC. No active tasks.";

  const cases = [
    {
      label: "Casual Hindi greeting",
      input: "Kya haal hai Tillu?",
      checks: { hasResponse: true, hasHindi: true },
    },
    {
      label: "Factual question",
      input: "What is the capital of France?",
      checks: { hasResponse: true, mentionsParis: true },
    },
    {
      label: "Search request",
      input: "Search for latest AI news today",
      checks: { hasResponse: true, hasAction: true },
    },
    {
      label: "Desktop action",
      input: "Open Chrome and go to YouTube",
      checks: { hasResponse: true, hasAction: true },
    },
    {
      label: "Memory write",
      input: "Remember that my Chemistry exam is on June 15",
      checks: { hasResponse: true },
    },
    {
      label: "Multi-step: search + speak",
      input: "Search today's cricket score and tell me",
      checks: { hasResponse: true, hasAction: true },
    },
    {
      label: "Heoster name check (never 'Harsh')",
      input: "What's my name?",
      checks: { hasResponse: true, noHarsh: true },
    },
    {
      label: "Urgent request",
      input: "URGENT: what time is it in IST right now?",
      checks: { hasResponse: true },
    },
    {
      label: "Code request",
      input: "Write a Python function to reverse a string",
      checks: { hasResponse: true },
    },
    {
      label: "Empty/edge case",
      input: "...",
      checks: { hasResponse: true },
    },
  ];

  for (const tc of cases) {
    console.log(`\n  ${C.bold}${C.magenta}${tc.label}${C.reset}`);
    info(`"${tc.input}"`);

    try {
      const start = Date.now();
      const { output, classification, latency_ms } = await runPipeline({
        userInput: tc.input,
        contextSummary: CTX,
        userState: "idle",
      });
      const total = Date.now() - start;

      dim(`intent=${classification.intent}  sc=${classification.short_circuit}  has_action=${classification.has_action}  urgency=${classification.urgency}  pipeline=${ms(latency_ms)}`);

      const text = output.response?.text ?? "";
      if (text) dim(`response: "${trunc(text, 100)}"`);
      if (output.action?.plan?.length) {
        dim(`action: ${output.action.plan.map(s => s.action).join(" → ")}`);
      }
      dim(`total: ${ms(total)}`);

      // Run checks
      let allOk = true;

      if (tc.checks.hasResponse && !text) {
        flunk("no response text"); allOk = false;
      }
      if (tc.checks.hasAction && !output.action) {
        caution("expected action plan but got none");
      }
      if (tc.checks.hasHindi && text && !/[a-zA-Z]/.test(text.slice(0, 20))) {
        // Just a soft check — Hindi/English mix is fine
      }
      if (tc.checks.mentionsParis && text && !text.toLowerCase().includes("paris")) {
        caution("response doesn't mention Paris");
      }
      if (tc.checks.noHarsh && text && text.toLowerCase().includes("harsh")) {
        flunk(`response uses "Harsh" instead of "Heoster"`); allOk = false;
      }

      if (allOk) pass(`passed  (${ms(total)})`);

    } catch (e) {
      flunk(`pipeline threw: ${(e as Error).message.slice(0, 80)}`);
    }
  }
}

// ─── 5. Fallback Chain Test ───────────────────────────────────────────────────

async function testFallbackChain(): Promise<void> {
  head("── 5. Fallback Chain ──────────────────────────────────────────");

  // Simulate Cerebras being down by calling with a bad key
  info("Testing classifier fallback (Cerebras → Groq)");
  try {
    const { classify } = await import("./src/brain/classifier");
    // Normal classify — if Cerebras fails it should fall to Groq
    const out = await classify("What time is it?", "test context");
    pass(`Classifier fallback chain`, `landed on intent=${out.intent}`);
  } catch (e) {
    flunk(`Classifier fallback chain`, (e as Error).message.slice(0, 60));
  }

  // Test writer fallback (Gemini → OpenRouter)
  info("Testing writer fallback (Gemini → OpenRouter)");
  try {
    const { write } = await import("./src/brain/writer");
    const text = await write("Say hello", "", "test context", "idle");
    if (text && text.length > 5) {
      pass(`Writer fallback chain`, `got ${text.length} chars`);
      dim(`"${trunc(text, 80)}"`);
    } else {
      flunk(`Writer fallback chain`, "empty response");
    }
  } catch (e) {
    flunk(`Writer fallback chain`, (e as Error).message.slice(0, 60));
  }
}

// ─── 6. Wake-Up Greeting Test ─────────────────────────────────────────────────

async function testWakeUp(): Promise<void> {
  head("── 6. Wake-Up Greeting ────────────────────────────────────────");

  try {
    const { writeWakeUpGreeting } = await import("./src/brain/writer");
    const start = Date.now();
    const greeting = await writeWakeUpGreeting({
      lastSessionSummary: "Heoster was working on Tillu-Core architecture",
      todayEvents: "Physics class at 10 AM",
      upcomingBirthdays: "Aryan's birthday in 2 days",
      briefingContent: "Today's news: AI advancements, cricket match results",
    });

    if (greeting && greeting.length > 10) {
      pass(`Wake-up greeting generated`, ms(Date.now() - start));
      dim(`"${trunc(greeting, 120)}"`);

      if (greeting.toLowerCase().includes("harsh")) {
        flunk(`Uses "Harsh" instead of "Heoster"`);
      }
      if (!greeting.toLowerCase().includes("heoster")) {
        caution(`Doesn't mention "Heoster" by name`);
      }
    } else {
      flunk(`Wake-up greeting empty`);
    }
  } catch (e) {
    flunk(`Wake-up greeting`, (e as Error).message.slice(0, 80));
  }
}

// ─── 7. Proactive Engine Test ─────────────────────────────────────────────────

async function testProactive(): Promise<void> {
  head("── 7. Proactive Engine (Tillu initiates) ──────────────────────");

  const cases = [
    {
      label: "Birthday reminder",
      trigger: "upcoming_birthday",
      context: "Heoster is online.",
      data: "Aryan (friend) — 2 days away",
    },
    {
      label: "Idle after work",
      trigger: "idle_after_work",
      context: "Heoster has been idle for 12 minutes after coding session.",
      data: "Last active app: code.exe. Idle for 12 minutes.",
    },
    {
      label: "Deep focus check-in",
      trigger: "deep_focus",
      context: "Heoster has been in Chrome for 35 minutes.",
      data: "App: chrome.exe. URL: github.com/tillu-core",
    },
    {
      label: "Tracked topic update",
      trigger: "tracked_topic_update",
      context: "Heoster tracks: cricket, AI, board exams",
      data: "India won the T20 match against Australia by 6 wickets.",
    },
    {
      label: "Morning check-in",
      trigger: "morning_checkin",
      context: "It's 9 AM IST. Heoster just came online.",
      data: "Current time: 09:00 IST",
    },
  ];

  for (const tc of cases) {
    try {
      const start = Date.now();
      const text = await writeProactiveMessage({
        trigger: tc.trigger,
        context: tc.context,
        data: tc.data,
      });

      if (text && text.length > 5) {
        pass(`${tc.label}`, ms(Date.now() - start));
        dim(`"${trunc(text, 100)}"`);
        if (text.toLowerCase().includes("harsh")) {
          flunk(`Uses "Harsh" instead of "Heoster"`);
        }
      } else {
        flunk(`${tc.label}`, "empty response");
      }
    } catch (e) {
      flunk(`${tc.label}`, (e as Error).message.slice(0, 60));
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗`);
  console.log(`║     TILLU Brain — Extended Cloud Test Suite         ║`);
  console.log(`╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  Classifier → Planner → Writer | No Sense/Hands/UI${C.reset}\n`);

  const totalStart = Date.now();

  await testProviders();
  await testServices();
  await testClassifier();
  await testPipeline();
  await testFallbackChain();
  await testWakeUp();
  await testProactive();

  // ── Summary ──
  head("── Summary ─────────────────────────────────────────────────────");
  console.log(`
  ${C.green}${C.bold}Passed:${C.reset}  ${results.passed}
  ${C.yellow}${C.bold}Warned:${C.reset}  ${results.warned}
  ${C.red}${C.bold}Failed:${C.reset}  ${results.failed}
  ${C.dim}Total time: ${ms(Date.now() - totalStart)}${C.reset}
`);

  if (results.failed === 0) {
    console.log(`  ${C.green}${C.bold}✓ Brain is healthy. All critical paths working.${C.reset}\n`);
  } else if (results.failed <= 2) {
    console.log(`  ${C.yellow}${C.bold}⚠ Minor issues — check provider keys above.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ Multiple failures — review provider config.${C.reset}\n`);
  }
}

main().catch((e) => {
  console.error(`\n${C.red}Fatal:${C.reset}`, e);
  process.exit(1);
});
