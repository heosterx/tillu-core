/**
 * test-production.ts — Production test against https://tillu-core.onrender.com
 *
 * Tests every REST endpoint, the /message pipeline, and WebSocket connections.
 * No local env needed — hits the live deployed service.
 *
 * Run: npx tsx test-production.ts
 */

const BASE = "https://tillu-core.onrender.com";
const WS_BASE = "wss://tillu-core.onrender.com";

// ─── Colours ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", red: "\x1b[31m",
  cyan: "\x1b[36m", blue: "\x1b[34m", magenta: "\x1b[35m",
};

const ok   = (m: string) => { passed++; console.log(`  ${C.green}✓${C.reset} ${m}`); };
const fail = (m: string) => { failed++; console.log(`  ${C.red}✗${C.reset} ${m}`); };
const warn = (m: string) => { warned++; console.log(`  ${C.yellow}⚠${C.reset} ${m}`); };
const head = (m: string) => console.log(`\n${C.bold}${C.blue}${m}${C.reset}`);
const dim  = (m: string) => console.log(`${C.dim}    ${m}${C.reset}`);
const ms   = (n: number) => n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`;
const trunc = (s: string, n = 100) => s.length > n ? s.slice(0, n) + "…" : s;

let passed = 0, failed = 0, warned = 0;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function GET(path: string, timeoutMs = 15000): Promise<{ status: number; body: unknown; latency: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, latency: Date.now() - start };
  } finally { clearTimeout(t); }
}

async function POST(path: string, data: unknown, timeoutMs = 30000): Promise<{ status: number; body: unknown; latency: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, latency: Date.now() - start };
  } finally { clearTimeout(t); }
}

// ─── 1. Basic connectivity ────────────────────────────────────────────────────

async function testConnectivity(): Promise<void> {
  head("── 1. Connectivity & Keep-Alive");

  // Root
  try {
    const { status, body, latency } = await GET("/");
    if (status === 200 && (body as Record<string, unknown>)?.service === "tillu-core") {
      ok(`GET /  →  service=tillu-core  (${ms(latency)})`);
      dim(`version: ${(body as Record<string, unknown>).version}`);
    } else {
      fail(`GET /  →  status=${status}`);
    }
  } catch (e) { fail(`GET /  →  ${(e as Error).message}`); }

  // Ping (keep-alive endpoint for cron-job.org)
  try {
    const { status, body, latency } = await GET("/ping");
    const b = body as Record<string, unknown>;
    if (status === 200 && b?.ok === true) {
      ok(`GET /ping  →  ok=true  mode=${b.mode}  (${ms(latency)})`);
      dim(`dream_loop: ${JSON.stringify(b.dream_loop)}`);
      dim(`timestamp: ${b.timestamp}`);
    } else {
      fail(`GET /ping  →  status=${status}  body=${JSON.stringify(body)?.slice(0, 80)}`);
    }
  } catch (e) { fail(`GET /ping  →  ${(e as Error).message}`); }
}

// ─── 2. Health endpoint ───────────────────────────────────────────────────────

async function testHealth(): Promise<void> {
  head("── 2. Health Check");

  try {
    const { status, body, latency } = await GET("/health", 20000);
    const b = body as Record<string, unknown>;

    if (status !== 200) { fail(`GET /health  →  status=${status}`); return; }
    ok(`GET /health  →  200 OK  (${ms(latency)})`);

    // Mode
    dim(`mode: ${b.mode}`);

    // Connections
    const conn = b.connections as Record<string, unknown>;
    if (conn) {
      dim(`connections: sense=${conn.sense}  hands=${conn.hands}  ui=${conn.ui}`);
    }

    // Dream loop
    const dream = b.dream_loop as Record<string, unknown>;
    if (dream) {
      dim(`dream_loop: running=${dream.running}  next_prep=${dream.next_morning_prep}`);
    }

    // Router health
    const providers = b.providers as Record<string, unknown>;
    if (providers?.router_health) {
      const rh = providers.router_health as Record<string, Record<string, unknown>>;
      dim("router_health:");
      for (const [p, h] of Object.entries(rh)) {
        const status = h.cooldown ? `${C.yellow}COOLDOWN${C.reset}` : h.ok ? `${C.green}OK${C.reset}` : `${C.red}DOWN${C.reset}`;
        console.log(`${C.dim}      ${p.padEnd(12)} ${status}  calls=${h.calls}  failures=${h.failures}  failRate=${h.failRate}${C.reset}`);
      }
    }

    // Provider keys
    if (providers?.cerebras) {
      const c = providers.cerebras as Record<string, unknown>;
      if (c.key_set) ok(`Cerebras key set  verified=${c.verified}  latency=${ms(c.latency_ms as number)}`);
      else warn(`Cerebras key NOT set`);
    }
    if (providers?.groq) {
      const g = providers.groq as Record<string, unknown>;
      if (g.key_set) ok(`Groq key set`);
      else warn(`Groq key NOT set`);
    }
    if (providers?.openrouter) {
      const o = providers.openrouter as Record<string, unknown>;
      if (o.key_set) ok(`OpenRouter key set`);
      else warn(`OpenRouter key NOT set`);
    }

    // Services
    const services = b.services as Record<string, unknown>;
    if (services) {
      dim(`services: memory=${services.memory}  search=${services.search}`);
    }

  } catch (e) { fail(`GET /health  →  ${(e as Error).message}`); }
}

// ─── 3. Presence endpoint ─────────────────────────────────────────────────────

async function testPresence(): Promise<void> {
  head("── 3. Presence");

  try {
    const { status, body, latency } = await GET("/presence");
    const b = body as Record<string, unknown>;
    if (status === 200) {
      ok(`GET /presence  →  mode=${b.mode}  (${ms(latency)})`);
      dim(`sense=${b.sense_connected}  hands=${b.hands_connected}  ui=${b.ui_connected}`);
      dim(`last_seen: ${b.last_seen ?? "never"}`);
    } else {
      fail(`GET /presence  →  status=${status}`);
    }
  } catch (e) { fail(`GET /presence  →  ${(e as Error).message}`); }
}

// ─── 4. Dream loop status ─────────────────────────────────────────────────────

async function testDreamStatus(): Promise<void> {
  head("── 4. Dream Loop");

  try {
    const { status, body, latency } = await GET("/dream/status");
    const b = body as Record<string, unknown>;
    if (status === 200) {
      ok(`GET /dream/status  →  running=${b.running}  (${ms(latency)})`);
      dim(`next_morning_prep: ${b.next_morning_prep}`);
    } else {
      fail(`GET /dream/status  →  status=${status}`);
    }
  } catch (e) { fail(`GET /dream/status  →  ${(e as Error).message}`); }
}

// ─── 5. Briefing endpoint ─────────────────────────────────────────────────────

async function testBriefing(): Promise<void> {
  head("── 5. Briefing");

  try {
    const { status, body, latency } = await GET("/briefing");
    if (status === 200) {
      ok(`GET /briefing  →  200 OK  (${ms(latency)})`);
      dim(`body: ${trunc(JSON.stringify(body), 100)}`);
    } else {
      warn(`GET /briefing  →  status=${status} (may be null if no briefing prepared yet)`);
    }
  } catch (e) { fail(`GET /briefing  →  ${(e as Error).message}`); }
}

// ─── 6. Message endpoint (full pipeline test) ─────────────────────────────────

async function testMessage(): Promise<void> {
  head("── 6. POST /message  (Full Pipeline — Classify → Plan → Write)");

  const cases = [
    { text: "Kya haal hai Tillu?",                    label: "Hindi greeting" },
    { text: "What is the capital of India?",           label: "Factual question" },
    { text: "Search for latest AI news",               label: "Search intent" },
    { text: "Open Chrome and go to YouTube",           label: "Desktop action" },
    { text: "Remember my Physics exam is on June 10",  label: "Memory write" },
  ];

  for (const tc of cases) {
    try {
      const { status, body, latency } = await POST("/message", { text: tc.text }, 45000);
      const b = body as Record<string, unknown>;

      if (status === 200 && b?.ok === true) {
        ok(`${tc.label.padEnd(25)}  →  ok=true  session=${String(b.session_id ?? "").slice(-8)}  (${ms(latency)})`);
        dim(`"${tc.text}"`);
        // Note: /message is fire-and-forget, response comes via WebSocket
        // The ok=true just means the pipeline was triggered
      } else {
        fail(`${tc.label}  →  status=${status}  body=${JSON.stringify(body)?.slice(0, 80)}`);
      }
    } catch (e) {
      fail(`${tc.label}  →  ${(e as Error).message.slice(0, 80)}`);
    }
  }
}

// ─── 7. WebSocket connectivity ────────────────────────────────────────────────

async function testWebSocket(path: string, label: string, sendMsg?: object): Promise<void> {
  return new Promise((resolve) => {
    const { WebSocket } = require("ws") as typeof import("ws");
    const url = `${WS_BASE}${path}`;
    const ws = new WebSocket(url);
    const start = Date.now();
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        warn(`WS ${label}  →  timeout after 10s`);
        ws.terminate();
        resolve();
      }
    }, 10000);

    ws.on("open", () => {
      ok(`WS ${label}  →  connected  (${ms(Date.now() - start)})`);
      if (sendMsg) {
        ws.send(JSON.stringify(sendMsg));
        dim(`sent: ${JSON.stringify(sendMsg)}`);
      }
      // Wait briefly for any response then close
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      }, 2000);
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as Record<string, unknown>;
        dim(`received: type=${msg.type}  ${trunc(JSON.stringify(msg), 80)}`);
      } catch {
        dim(`received: ${data.toString().slice(0, 80)}`);
      }
    });

    ws.on("error", (e: Error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        fail(`WS ${label}  →  ${e.message.slice(0, 80)}`);
        resolve();
      }
    });

    ws.on("close", (code: number) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code === 1000 || code === 1001) {
          dim(`WS ${label} closed normally (${code})`);
        } else {
          warn(`WS ${label} closed with code ${code}`);
        }
        resolve();
      }
    });
  });
}

async function testWebSockets(): Promise<void> {
  head("── 7. WebSocket Connections");

  // Test all 3 WS paths
  await testWebSocket("/ui",    "UI    (/ui)",    { type: "message", text: "ping from production test" });
  await testWebSocket("/sense", "Sense (/sense)", { type: "presence", status: "online" });
  await testWebSocket("/hands", "Hands (/hands)", { type: "hands_ready", capabilities: ["test"] });

  // Test unknown path — should be rejected
  await new Promise<void>((resolve) => {
    const { WebSocket } = require("ws") as typeof import("ws");
    const ws = new WebSocket(`${WS_BASE}/unknown`);
    ws.on("close", (code: number) => {
      if (code === 1008) ok(`WS /unknown  →  correctly rejected (1008)`);
      else warn(`WS /unknown  →  closed with code ${code} (expected 1008)`);
      resolve();
    });
    ws.on("error", () => { ok(`WS /unknown  →  correctly rejected`); resolve(); });
    setTimeout(() => { ws.terminate(); resolve(); }, 5000);
  });
}

// ─── 8. Load test — rapid pings ───────────────────────────────────────────────

async function testLoad(): Promise<void> {
  head("── 8. Load Test  (10 rapid pings)");

  const times: number[] = [];
  const errors: string[] = [];

  await Promise.all(
    Array.from({ length: 10 }, async (_, i) => {
      try {
        const { latency } = await GET("/ping", 10000);
        times.push(latency);
      } catch (e) {
        errors.push(`ping ${i}: ${(e as Error).message.slice(0, 40)}`);
      }
    })
  );

  if (times.length > 0) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const min = Math.min(...times);
    const max = Math.max(...times);
    ok(`${times.length}/10 pings succeeded  avg=${ms(avg)}  min=${ms(min)}  max=${ms(max)}`);
  }
  if (errors.length > 0) {
    fail(`${errors.length} pings failed: ${errors.join(", ")}`);
  }
}

// ─── 9. CORS headers ──────────────────────────────────────────────────────────

async function testCORS(): Promise<void> {
  head("── 9. CORS Headers");

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(`${BASE}/ping`, {
      method: "OPTIONS",
      headers: { Origin: "https://tillu-ui.vercel.app", "Access-Control-Request-Method": "POST" },
      signal: ctrl.signal,
    });
    clearTimeout(t);

    const allowOrigin = res.headers.get("access-control-allow-origin");
    const allowMethods = res.headers.get("access-control-allow-methods");

    if (allowOrigin === "*" || allowOrigin?.includes("tillu")) {
      ok(`CORS  →  Access-Control-Allow-Origin: ${allowOrigin}`);
    } else {
      warn(`CORS  →  Allow-Origin: ${allowOrigin ?? "not set"}`);
    }
    dim(`Allow-Methods: ${allowMethods ?? "not set"}`);
  } catch (e) { warn(`CORS check  →  ${(e as Error).message.slice(0, 60)}`); }
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function printSummary(totalMs: number): void {
  head("── SUMMARY ─────────────────────────────────────────────────────────────");
  console.log(`
  ${C.green}${C.bold}Passed:${C.reset}  ${passed}
  ${C.yellow}${C.bold}Warned:${C.reset}  ${warned}
  ${C.red}${C.bold}Failed:${C.reset}  ${failed}
  ${C.dim}Total time: ${ms(totalMs)}${C.reset}
`);

  if (failed === 0) {
    console.log(`  ${C.green}${C.bold}✓ Production service is healthy.${C.reset}\n`);
  } else if (failed <= 2) {
    console.log(`  ${C.yellow}${C.bold}⚠ Minor issues — check above.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ Multiple failures — service may need attention.${C.reset}\n`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     TILLU-CORE — Production Test Suite                     ║`);
  console.log(`║     Target: https://tillu-core.onrender.com                ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const start = Date.now();

  await testConnectivity();
  await testHealth();
  await testPresence();
  await testDreamStatus();
  await testBriefing();
  await testMessage();
  await testWebSockets();
  await testLoad();
  await testCORS();

  printSummary(Date.now() - start);
}

main().catch(e => { console.error(`\n${C.red}Fatal:${C.reset}`, e); process.exit(1); });
