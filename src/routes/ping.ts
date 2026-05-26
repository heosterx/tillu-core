import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getDreamLoopStatus } from "../engines/dream-loop";

/**
 * GET /ping
 * Keep-alive endpoint for cron-job.org.
 * Pings every 10 minutes to prevent Render free tier sleep.
 */
export function pingHandler(req: Request, res: Response): void {
  res.json({
    ok: true,
    service: "tillu-core",
    mode: getPresenceState().mode,
    dream_loop: getDreamLoopStatus(),
    timestamp: new Date().toISOString(),
  });
}
