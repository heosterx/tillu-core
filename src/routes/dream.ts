import type { Request, Response } from "express";
import { getDreamLoopStatus } from "../engines/dream-loop";
import { getPresenceState } from "../engines/presence";

/**
 * GET /dream/status
 * Dream Loop status and next scheduled run.
 */
export function dreamStatusHandler(_req: Request, res: Response): void {
  const dream = getDreamLoopStatus();
  const presence = getPresenceState();

  res.json({
    mode: presence.mode,
    dream_loop: {
      ...dream,
      active: presence.mode === "offline",
      description: presence.mode === "offline"
        ? "Heoster is away — dream loop is active"
        : "Heoster is online — dream loop paused",
    },
  });
}
