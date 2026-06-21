import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getDreamLoopStatus } from "../engines/dream-loop";
import { getAliveState } from "../engines/tillu-alive";
import { isHandsConnected } from "../tools/hands.tool";
import { verifyCerebras } from "../brain/providers/cerebras";
import { getHealthStatus } from "../brain/providers/router";
import { config } from "../config";
import { logger } from "../utils/logger";
import axios from "axios";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  latency_ms?: number;
  error?: string;
}

interface ServiceHealth {
  memory: HealthCheckResult;
  search: HealthCheckResult;
  voice: HealthCheckResult;
  see: HealthCheckResult;
  newsWeather: HealthCheckResult;
}

/**
 * GET /health
 * Production-grade health check endpoint
 * - Quick health check (no dependency verification)
 * - Full health check (with dependency verification)
 * - Metrics for monitoring
 */
export async function healthHandler(req: Request, res: Response): Promise<void> {
  const checkType = req.query.check as string || "quick";
  const isFullCheck = checkType === "full";

  const startTime = Date.now();
  const presence = getPresenceState();
  const dream = getDreamLoopStatus();

  try {
    let serviceHealth: ServiceHealth | undefined;
    let cerebrasCheck: { ok: boolean; latency_ms?: number; error?: string } | undefined;

    if (isFullCheck) {
      // Parallel dependency checks
      const [servicesResult, cerebrasResult] = await Promise.all([
        checkServices(),
        verifyCerebras(),
      ]);
      
      serviceHealth = servicesResult;
      cerebrasCheck = cerebrasResult;
    }

    // Determine overall health status
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";
    
    if (isFullCheck && serviceHealth) {
      const unhealthyServices = Object.values(serviceHealth).filter(s => s.status === "unhealthy");
      const degradedServices = Object.values(serviceHealth).filter(s => s.status === "degraded");
      
      if (unhealthyServices.length > 0) {
        overallStatus = "unhealthy";
      } else if (degradedServices.length > 0) {
        overallStatus = "degraded";
      }
    }

    const response = {
      status: overallStatus,
      service: "tillu-core",
      version: "1.0.0",
      environment: config.env,
      check_type: checkType,
      uptime_ms: process.uptime() * 1000,
      memory_usage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      
      // System state
      system: {
        mode: presence.mode,
        connections: {
          sense: presence.sense_connected,
          hands: presence.hands_connected,
          ui: presence.ui_connected,
          hands_ready: isHandsConnected(),
        },
        dream_loop: dream,
        alive: getAliveState(),
      },

      // Provider health (only in full check)
      ...(isFullCheck && {
        providers: {
          router_health: getHealthStatus(),
          cerebras: {
            key_set: !!config.llm.cerebrasKey,
            models: ["gpt-oss-120b", "zai-glm-4.7"],
            verified: cerebrasCheck?.ok,
            latency_ms: cerebrasCheck?.latency_ms,
            error: cerebrasCheck?.error ?? null,
          },
          groq: {
            key_set: !!config.llm.groqKey,
            models: {
              active: ["openai/gpt-oss-20b", "qwen/qwen3.6-27b", "allam-2-7b", "openai/gpt-oss-120b", "groq/compound-mini"],
              deprecated_fallback: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen/qwen3-32b", "meta-llama/llama-4-scout-17b-16e-instruct"],
            },
          },
          openrouter: {
            key_set: !!config.llm.openrouterKey,
            models: ["poolside/laguna-xs.2:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "z-ai/glm-4.5-air:free"],
          },
        },
      }),

      // Service dependencies (only in full check)
      ...(isFullCheck && serviceHealth && {
        services: serviceHealth,
      }),

      // Service URLs (always present)
      service_urls: {
        memory:      config.services.memoryUrl,
        search:      config.services.searchUrl,
        voice:       config.services.voiceUrl,
        see:         config.services.seeUrl,
        newsWeather: config.services.newsWeatherUrl,
      },

      // Configuration (sanitized)
      configuration: {
        cerebrasModel: config.llm.cerebrasModel,
        groqModel: config.llm.groqModel,
        googleModel: config.llm.googleModel,
        openrouterModel: config.llm.openrouterModel,
        hfModel: config.llm.hfModel,
        dreamLoopEnabled: config.dreamLoop.enabled,
      },

      // Response time
      check_duration_ms: Date.now() - startTime,
    };

    // Set appropriate status code
    const statusCode = overallStatus === "healthy" ? 200 : overallStatus === "degraded" ? 200 : 503;
    res.status(statusCode).json(response);

  } catch (error) {
    logger.error("Health check failed", { checkType }, error as Error);
    
    res.status(503).json({
      status: "unhealthy",
      service: "tillu-core",
      version: "1.0.0",
      error: "Health check failed",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Check all external services health
 */
async function checkServices(): Promise<ServiceHealth> {
  const timeout = config.services.serviceTimeout;
  
  const checkService = async (name: string, url: string): Promise<HealthCheckResult> => {
    const start = Date.now();
    try {
      const response = await axios.get(`${url}/health`, {
        timeout,
        validateStatus: () => true, // Accept any status code
      });
      
      const latency = Date.now() - start;
      
      if (response.status >= 200 && response.status < 300) {
        return { status: "healthy", latency_ms: latency };
      } else if (response.status >= 500) {
        return { status: "unhealthy", latency_ms: latency, error: `HTTP ${response.status}` };
      } else {
        return { status: "degraded", latency_ms: latency, error: `HTTP ${response.status}` };
      }
    } catch (error) {
      const latency = Date.now() - start;
      const message = error instanceof Error ? error.message : "Unknown error";
      
      // Network errors or timeouts are unhealthy
      if (axios.isAxiosError(error) && error.code === "ECONNABORTED") {
        return { status: "unhealthy", latency_ms: latency, error: "Timeout" };
      }
      
      return { status: "unhealthy", latency_ms: latency, error: message };
    }
  };

  const [memory, search, voice, see, newsWeather] = await Promise.all([
    checkService("memory", config.services.memoryUrl),
    checkService("search", config.services.searchUrl),
    checkService("voice", config.services.voiceUrl),
    checkService("see", config.services.seeUrl),
    checkService("newsWeather", config.services.newsWeatherUrl),
  ]);

  return { memory, search, voice, see, newsWeather };
}