import type { Request, Response } from "express";
import { getLatestBriefing } from "../tools/memory.tool";

/**
 * GET /briefing
 * Get the latest prepared morning briefing.
 */
export async function briefingHandler(_req: Request, res: Response): Promise<void> {
  const briefing = await getLatestBriefing();
  res.json({
    ready: !!briefing,
    briefing: briefing ?? null,
  });
}
