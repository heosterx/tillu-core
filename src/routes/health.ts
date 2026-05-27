import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getDreamLoopStatus } from "../engines/dream-loop";
import { isHandsConnected } from "../tools/hands.tool";
import { verifyCerebras, CEREBRAS_MODELS } from "../brain/providers/cerebras";
import { config } from "../config";

/**
 * GET /health
 * Full system health — live provider verification, connection states, dream loop.
 */
export async function healthHandler(req: Request, res: Response): Promise<void> {
  const presence = getPresenceState();
  const dream = getDreamLoopStatus();

  const fmtKey = (key: string, label: string) =>
    key ? `✅ set (${key.length} chars)` : `❌ not set — ${label} disabled`;

  // Live Cerebras verification (fast — 5s timeout)
  const cerebrasCheck = await verifyCerebras();

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
      cerebras: {
        key_set: !!config.llm.cerebrasKey,
        model: config.llm.cerebrasModel,
        available_models: CEREBRAS_MODELS,
        verified: cerebrasCheck.ok,
        latency_ms: cerebrasCheck.latency_ms,
        error: cerebrasCheck.error ?? null,
        role: "Stage 1: Classifier (fastest)",
      },
      groq: {
        key_set: !!config.llm.groqKey,
        model: config.llm.groqModel,
        status: fmtKey(config.llm.groqKey, "Planner"),
        role: "Stage 2: Planner (function calling)",
      },
      google: {
        key_set: !!config.llm.googleKey,
        model: config.llm.googleModel,
        status: fmtKey(config.llm.googleKey, "Writer"),
        role: "Stage 3: Writer (quality responses)",
      },
      openrouter: {
        key_set: !!config.llm.openrouterKey,
        model: config.llm.openrouterModel,
        status: fmtKey(config.llm.openrouterKey, "Fallback"),
        role: "Fallback for all stages",
      },
      huggingface: {
        key_set: !!config.llm.hfKey,
        model: config.llm.hfModel,
        status: fmtKey(config.llm.hfKey, "Last resort"),
        role: "Last resort fallback",
      },
    },
    services: {
      memory: config.services.memoryUrl,
      search: config.services.searchUrl,
      voice:  config.services.voiceUrl,
      see:    config.services.seeUrl,
    },
    env_vars: {
      CEREBRAS_MODEL:    config.llm.cerebrasModel,
      GROQ_MODEL:        config.llm.groqModel,
      GOOGLE_MODEL:      config.llm.googleModel,
      OPENROUTER_MODEL:  config.llm.openrouterModel,
      HF_MODEL:          config.llm.hfModel,
    },
    timestamp: new Date().toISOString(),
  });
}
