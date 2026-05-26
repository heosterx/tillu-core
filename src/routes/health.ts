import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getDreamLoopStatus } from "../engines/dream-loop";
import { isHandsConnected } from "../tools/hands.tool";
import { config } from "../config";

/**
 * GET /health
 * Full system health — provider keys, connection states, dream loop.
 */
export function healthHandler(req: Request, res: Response): void {
  const presence = getPresenceState();
  const dream = getDreamLoopStatus();

  const fmt = (key: string, label: string) =>
    key ? `✅ set (${key.length} chars)` : `❌ not set — ${label} disabled`;

  res.json({
    ok: true,
    service: "tillu-core",
    version: "1.0.0",
    mode: presence.mode,
    connections: {
      sense: presence.sense_connected,
      hands: presence.hands_connected,
      ui: presence.ui_connected,
      hands_ready: isHandsConnected(),
    },
    dream_loop: dream,
    providers: {
      cerebras:    fmt(config.llm.cerebrasKey,   "Classifier"),
      groq:        fmt(config.llm.groqKey,        "Planner"),
      google:      fmt(config.llm.googleKey,      "Writer"),
      openrouter:  fmt(config.llm.openrouterKey,  "Fallback"),
      huggingface: fmt(config.llm.hfKey,          "Last resort"),
    },
    services: {
      memory: config.services.memoryUrl,
      search: config.services.searchUrl,
      voice:  config.services.voiceUrl,
      see:    config.services.seeUrl,
    },
    timestamp: new Date().toISOString(),
  });
}
