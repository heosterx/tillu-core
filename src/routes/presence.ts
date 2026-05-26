import type { Request, Response } from "express";
import { getPresenceState } from "../engines/presence";
import { getLatestContext } from "../ws/sense-handler";

/**
 * GET /presence
 * Current online/offline state and latest Sense context.
 */
export function presenceHandler(req: Request, res: Response): void {
  const state = getPresenceState();
  const ctx = getLatestContext();

  res.json({
    mode: state.mode,
    connections: {
      sense: state.sense_connected,
      hands: state.hands_connected,
      ui: state.ui_connected,
    },
    last_seen: state.last_seen,
    sense_context: ctx
      ? {
          user_state: ctx.user_state,
          active_app: ctx.active_app,
          active_url: ctx.active_url,
          idle_seconds: ctx.idle_seconds,
          interruption_ok: ctx.interruption_ok,
        }
      : null,
  });
}
