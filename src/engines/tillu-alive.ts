/**
 * tillu-alive.ts — The "Tillu is alive" engine.
 *
 * Runs a 60-second heartbeat loop 24/7 regardless of online/offline mode.
 * - Checks health of all cloud services every 5 ticks (~5 min)
 * - ONLINE: runs RAG-enhanced proactive checks
 * - OFFLINE: runs mini dream cycles (birthdays + tracked topics every 10 ticks)
 * - Exports getAliveState() for the health endpoint
 */

import axios from "axios";
import { config } from "../config";
import { isOnline } from "./presence";
import { runProactiveTick, checkBirthdays, checkTrackedTopics } from "./proactive";
import { getHeartbeatStats } from "../ws/heartbeat";
import type { HeartbeatStat } from "../ws/heartbeat";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ServiceHealth {
  ok: boolean;
  latency_ms: number;
  last_checked: string;
  error?: string;
}

export interface AliveState {
  uptime_s: number;
  tick_count: number;
  last_tick: string;
  mode: "online" | "offline";
  services: {
    memory: ServiceHealth;
    search: ServiceHealth;
    voice: ServiceHealth;
    see: ServiceHealth;
    newsWeather: ServiceHealth;
  };
  heartbeats: Record<string, HeartbeatStat>;
  rag_last_used: string | null;
  dream_ticks: number;
  proactive_ticks: number;
}

// ─── State ────────────────────────────────────────────────────────────────────

const startTime = Date.now();
let tickCount = 0;
let dreamTicks = 0;
let proactiveTicks = 0;
let ragLastUsed: string | null = null;

const serviceHealth: AliveState["services"] = {
  memory:      { ok: false, latency_ms: 0, last_checked: "", error: "not checked yet" },
  search:      { ok: false, latency_ms: 0, last_checked: "", error: "not checked yet" },
  voice:       { ok: false, latency_ms: 0, last_checked: "", error: "not checked yet" },
  see:         { ok: false, latency_ms: 0, last_checked: "", error: "not checked yet" },
  newsWeather: { ok: false, latency_ms: 0, last_checked: "", error: "not checked yet" },
};

// ─── Service health check ─────────────────────────────────────────────────────

async function pingService(url: string, path: string): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    await axios.get(`${url}${path}`, { timeout: 8000 });
    return { ok: true, latency_ms: Date.now() - start, last_checked: new Date().toISOString() };
  } catch (e) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      error: (e as Error).message.slice(0, 80),
    };
  }
}

async function checkServices(): Promise<void> {
  const [mem, srch, voice, see, news] = await Promise.allSettled([
    pingService(config.services.memoryUrl,      "/health"),
    pingService(config.services.searchUrl,       "/health"),
    pingService(config.services.voiceUrl,        "/health"),
    pingService(config.services.seeUrl,          "/health"),
    pingService(config.services.newsWeatherUrl,  "/health"),
  ]);

  const fallback: ServiceHealth = { ok: false, latency_ms: 0, last_checked: new Date().toISOString(), error: "check failed" };

  serviceHealth.memory      = mem.status   === "fulfilled" ? mem.value   : fallback;
  serviceHealth.search      = srch.status  === "fulfilled" ? srch.value  : fallback;
  serviceHealth.voice       = voice.status === "fulfilled" ? voice.value : fallback;
  serviceHealth.see         = see.status   === "fulfilled" ? see.value   : fallback;
  serviceHealth.newsWeather = news.status  === "fulfilled" ? news.value  : fallback;

  const healthy = Object.values(serviceHealth).filter(s => s.ok).length;
  console.log(`[TilluAlive] Services: ${healthy}/5 healthy`);
}

// ─── Online tick — RAG-enhanced proactive ────────────────────────────────────

async function onlineTick(): Promise<void> {
  proactiveTicks++;

  // Lazy import to avoid circular dependency
  const { getLatestContext } = await import("../ws/sense-handler");
  const ctx = getLatestContext();

  if (ctx) {
    try {
      const { proactiveContextRag } = await import("../rag/pipelines/proactive-rag");
      const ragResult = await proactiveContextRag(ctx);
      if (ragResult.chunks.length > 0) {
        ragLastUsed = new Date().toISOString();
      }
    } catch (e) {
      console.warn("[TilluAlive] RAG proactive failed:", (e as Error).message.slice(0, 60));
    }
    await runProactiveTick(ctx);
  }
}

// ─── Offline tick — mini dream cycle ─────────────────────────────────────────

async function offlineTick(): Promise<void> {
  dreamTicks++;
  // Every 10 offline ticks (~10 min): check birthdays + tracked topics
  if (dreamTicks % 10 === 0) {
    console.log("[TilluAlive] Offline mini-dream cycle...");
    await Promise.allSettled([checkBirthdays(), checkTrackedTopics()]);
  }
}

// ─── Main tick ────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  tickCount++;

  // Check services every 5 ticks (~5 min)
  if (tickCount % 5 === 0) {
    void checkServices();
  }

  if (isOnline()) {
    await onlineTick();
  } else {
    await offlineTick();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getAliveState(): AliveState {
  return {
    uptime_s:        Math.floor((Date.now() - startTime) / 1000),
    tick_count:      tickCount,
    last_tick:       new Date().toISOString(),
    mode:            isOnline() ? "online" : "offline",
    services:        { ...serviceHealth },
    heartbeats:      getHeartbeatStats(),
    rag_last_used:   ragLastUsed,
    dream_ticks:     dreamTicks,
    proactive_ticks: proactiveTicks,
  };
}

export function startTilluAlive(): void {
  // Initial service check on startup
  void checkServices();

  // 60-second alive tick
  setInterval(() => {
    void tick().catch(e =>
      console.error("[TilluAlive] Tick error:", (e as Error).message)
    );
  }, 60_000);

  console.log("[TilluAlive] Tillu is alive — heartbeat started (60s interval)");
}
