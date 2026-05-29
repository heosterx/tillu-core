/**
 * test-search-prod.ts
 * Tests web search through the live production Core at wss://tillu-core.onrender.com
 * Connects via WebSocket /ui, sends search queries, captures full response pipeline.
 *
 * Run: npx tsx test-search-prod.ts
 */

import dotenv from "dotenv";
dotenv.config();

import WebSocket from "ws";

const BASE = "https://tillu-core.onrender.com";
const WS   = "wss://tillu-core.onrender.com";

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m",
};

const ok   = (m: string) => console.log(`  ${C.green}✓${C.reset} ${m}`);
const fail = (m: string) => console.log(`  ${C.red}✗${C.reset} ${m}`);
const info = (m: string) => console.log(`  ${C.cyan}→${C.reset} ${m}`);
const dim  = (m: string) => console.log(`${C.dim}    ${m}${C.reset}`);
const head = (m: string) => console.log(`\n${C.bold}${C.blue}${m}${C.reset}`);
const ms   = (n: number) => n < 1000 ? `${n}ms` : `${(n/1000).toFixed(1)}s`;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function GET(path: string): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(BASE + path, { signal: ctrl.signal });
    return await r.json() as Record<string, unknown>;
  } finally { clearTimeout(t); }
}

// ─── WebSocket search test ────────────────────────────────────────────────────

interface TestResult {
  query: string;
  got_thought: boolean;
  got_response: boolean;
  got_audio: boolean;
  got_action: boolean;
  response_text: string;
  action_steps: string[];
  latency_ms: number;
  error?: string;
}

async function testSearchQuery(query: string, timeoutMs = 50000): Promise<TestResult> {
  return new Promise((resolve) => {
    const result: TestResult = {
      query,
      got_thought: false,
      got_response: false,
      got_audio: false,
      got_action: false,
      response_text: "",
      action_steps: [],
      latency_ms: 0,
    };

    const start = Date.now();
    let resolved = false;

    const ws = new WebSocket(`${WS}/ui`);

    const finish = (err?: string) => {
      if (resolved) return;
      resolved = true;
      result.latency_ms = Date.now() - start;
      if (err) result.error = err;
      try { ws.terminate(); } catch (_) {}
      resolve(result);
    };

    const timer = setTimeout(() => finish("timeout"), timeoutMs);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "message", text: query }));
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const type = msg.type as string;

        switch (type) {
          case "thought":
            result.got_thought = true;
            dim(`[thought] ${msg.step}`);
            break;

          case "response_text":
            result.got_response = true;
            result.response_text = String(msg.text ?? "").slice(0, 200);
            dim(`[response] "${result.response_text}"`);
            // Wait a bit more for audio/action
            setTimeout(() => { clearTimeout(timer); finish(); }, 3000);
            break;

          case "response_audio":
            result.got_audio = true;
            dim(`[audio] ${String(msg.audio_url ?? "").slice(0, 80)}`);
            break;

          case "action_start": {
            result.got_action = true;
            const plan = (msg.plan as Array<{ action: string }>) ?? [];
            result.action_steps = plan.map(s => s.action);
            dim(`[action_start] ${result.action_steps.join(" → ")}`);
            break;
          }

          case "action_step":
            dim(`[step] ${msg.step_id} → ${msg.status}`);
            break;

          case "action_done":
            dim(`[action_done] success=${msg.success}`);
            break;

          case "error":
            finish(`Core error: ${msg.message}`);
            break;
        }
      } catch (e) {
        dim(`[parse error] ${(e as Error).message}`);
      }
    });

    ws.on("error", (e: Error) => finish(`WS error: ${e.message}`));
    ws.on("close", (code: number) => {
      if (!resolved && code !== 1000) finish(`WS closed: ${code}`);
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     Tillu Web Search — Production Test                     ║`);
  console.log(`║     Target: ${BASE}                ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // ── 1. Ping ──
  head("── 1. Service Health");
  try {
    const ping = await GET("/ping");
    ok(`/ping  ok=${ping.ok}  mode=${ping.mode}  ts=${ping.timestamp}`);
  } catch (e) { fail(`/ping failed: ${(e as Error).message}`); return; }

  // ── 2. Search queries ──
  head("── 2. Web Search Queries (via WebSocket /ui)");

  const queries = [
    "What is the weather in Muzaffarnagar right now",
    "Search for IPL 2026 cricket score today",
    "Who won the last India cricket match",
    "Latest news about board exams 2026 India",
  ];

  let passed = 0;
  let failed_count = 0;

  for (const query of queries) {
    console.log(`\n  ${C.bold}${C.magenta}"${query}"${C.reset}`);
    const result = await testSearchQuery(query);

    if (result.error) {
      fail(`${result.error}  (${ms(result.latency_ms)})`);
      failed_count++;
      continue;
    }

    const checks = [
      result.got_thought   ? "thought ✓" : "thought ✗",
      result.got_response  ? "response ✓" : "response ✗",
      result.got_audio     ? "audio ✓" : "audio ✗",
      result.got_action    ? `action[${result.action_steps.join("→")}] ✓` : "action ✗",
    ];

    if (result.got_response) {
      ok(`${ms(result.latency_ms)}  ${checks.join("  ")}`);
      passed++;
    } else {
      fail(`No response received  ${ms(result.latency_ms)}`);
      failed_count++;
    }
  }

  // ── Summary ──
  head("── Summary");
  console.log(`\n  ${C.green}${C.bold}Passed: ${passed}${C.reset}  ${C.red}${C.bold}Failed: ${failed_count}${C.reset}`);

  if (failed_count === 0) {
    console.log(`\n  ${C.green}${C.bold}✓ Web search pipeline is working end-to-end in production.${C.reset}\n`);
  } else {
    console.log(`\n  ${C.yellow}${C.bold}⚠ Some queries failed — check search service or Core logs.${C.reset}\n`);
  }
}

main().catch(e => { console.error(`\n${C.red}Fatal:${C.reset}`, e); process.exit(1); });
