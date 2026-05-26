import type WebSocket from "ws";
import type { InboundMessage } from "../types";
import { markConnected, markDisconnected, setUISocket, emitToUI } from "../engines/presence";
import { runAgenticLoop } from "../engines/agentic-loop";
import { getContextSummary, getLatestContext, getLatestScreenshot } from "./sense-handler";
import { loadContext } from "../tools/memory.tool";
import { HEOSTER } from "../types";

// Pending confirmations waiting for UI approval
const pendingConfirmations = new Map<string, () => void>();

export function registerConfirmation(actionId: string, onConfirm: () => void): void {
  pendingConfirmations.set(actionId, onConfirm);
}

export function handleUIConnection(ws: WebSocket): void {
  console.log("[UI] Connected");
  markConnected("ui");
  setUISocket(ws);

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as InboundMessage;

      switch (msg.type) {
        case "message":
        case "voice": {
          const userInput = msg.type === "voice" ? msg.transcript : msg.text;
          if (!userInput?.trim()) return;

          console.log(`[UI] Input from ${HEOSTER.nickname}: "${userInput.slice(0, 80)}"`);

          const sessionId = `sess_${Date.now()}`;
          const ctx = await loadContext(sessionId, userInput);
          const contextSummary = ctx.summary;
          const senseCtx = getLatestContext();

          await runAgenticLoop({
            userInput,
            contextSummary,
            userState: senseCtx?.user_state,
            sessionId,
            image: msg.image,
            latestScreenshot: getLatestScreenshot() ?? undefined,
          });
          break;
        }

        case "confirm": {
          const onConfirm = pendingConfirmations.get(msg.action_id);
          if (onConfirm && msg.approved) {
            pendingConfirmations.delete(msg.action_id);
            onConfirm();
          } else if (!msg.approved) {
            pendingConfirmations.delete(msg.action_id);
            emitToUI({
              type: "response_text",
              text: `Okay Heoster, I cancelled that action.`,
            });
          }
          break;
        }

        case "cancel": {
          pendingConfirmations.delete(msg.action_id);
          emitToUI({ type: "action_done", action_id: msg.action_id, success: false });
          break;
        }
      }
    } catch (e) {
      console.error("[UI] Message handling error:", (e as Error).message);
      emitToUI({ type: "error", message: "Something went wrong. Try again.", recoverable: true });
    }
  });

  ws.on("close", () => {
    console.log("[UI] Disconnected");
    markDisconnected("ui");
  });

  ws.on("error", (e) => {
    console.error("[UI] Error:", e.message);
  });
}
