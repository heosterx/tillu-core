import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getDreamLoopStatus } from "../engines/dream-loop";
import { getAliveState } from "../engines/tillu-alive";
import { isHandsConnected } from "../tools/hands.tool";
import { verifyCerebras } from "../brain/providers/cerebras";
import { getHealthStatus } from "../brain/providers/router";
import { config } from "../config";

/**
 * GET /health
 * Full system health — live provider verification, connection states, dream loop.
 */
export async function healthHandler(_req: Request, res: Response): Promise<void> {
  const presence = getPresenceState();
  const dream = getDreamLoopStatus();

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
    alive: getAliveState(),
    providers: {
      router_health: getHealthStatus(),
      cerebras: {
        key_set: !!config.llm.cerebrasKey,
        models: ["gpt-oss-120b", "zai-glm-4.7"],
        verified: cerebrasCheck.ok,
        latency_ms: cerebrasCheck.latency_ms,
        error: cerebrasCheck.error ?? null,
      },
      groq: {
        key_set: !!config.llm.groqKey,
        models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "qwen/qwen3-32b", "allam-2-7b"],
      },
      openrouter: {
        key_set: !!config.llm.openrouterKey,
        models: ["poolside/laguna-xs.2:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "z-ai/glm-4.5-air:free"],
      },
    },
    services: {
      memory:      config.services.memoryUrl,
      search:      config.services.searchUrl,
      voice:       config.services.voiceUrl,
      see:         config.services.seeUrl,
      newsWeather: config.services.newsWeatherUrl,
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
