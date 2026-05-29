import type WebSocket from "ws";
import type { InboundMessage, SenseContext } from "../types";
import { markConnected, markDisconnected } from "../engines/presence";
import { runProactiveTick } from "../engines/proactive";
import { setupHeartbeat } from "./heartbeat";

// Latest context from Sense — read by agentic loop before decisions
let latestContext: SenseContext | null = null;
let latestScreenshot: string | null = null;

// Throttle proactive ticks — run at most every 30s, not every 3s
let lastProactiveTick = 0;
const PROACTIVE_TICK_INTERVAL_MS = 30_000;

export function getLatestContext(): SenseContext | null {
  return latestContext;
}

export function getLatestScreenshot(): string | null {
  return latestScreenshot;
}

export function getContextSummary(): string {
  if (!latestContext) return "No context available — Sense not connected";
  return [
    `App: ${latestContext.active_app}`,
    latestContext.active_url ? `URL: ${latestContext.active_url}` : "",
    `State: ${latestContext.user_state}`,
    `Idle: ${latestContext.idle_seconds}s`,
    latestContext.screen_description ? `Screen: ${latestContext.screen_description}` : "",
  ].filter(Boolean).join(" | ");
}

export function handleSenseConnection(ws: WebSocket): void {
  console.log("[Sense] Connected");
  markConnected("sense");
  setupHeartbeat(ws, "Sense");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as InboundMessage;

      if (msg.type === "presence") {
        if (msg.status === "offline") {
          markDisconnected("sense");
        }
      } else if (msg.type === "context") {
        latestContext = msg.data;

        // Extract screenshot if included
        if ((msg.data as SenseContext & { screenshot?: string }).screenshot) {
          latestScreenshot = (msg.data as SenseContext & { screenshot?: string }).screenshot ?? null;
        }

        // Run proactive tick (throttled to every 30s)
        const now = Date.now();
        if (now - lastProactiveTick > PROACTIVE_TICK_INTERVAL_MS) {
          lastProactiveTick = now;
          void runProactiveTick(msg.data);
        }
      }
    } catch (e) {
      console.warn("[Sense] Invalid message:", (e as Error).message);
    }
  });

  ws.on("close", () => {
    console.log("[Sense] Disconnected");
    markDisconnected("sense");
    latestContext = null;
  });

  ws.on("error", (e) => {
    console.error("[Sense] Error:", e.message);
  });
}
