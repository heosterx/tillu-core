import type WebSocket from "ws";
import type { InboundMessage } from "../types";
import { markConnected, markDisconnected } from "../engines/presence";
import { setHandsConnection, resolveAction } from "../tools/hands.tool";

export function handleHandsConnection(ws: WebSocket): void {
  console.log("[Hands] Connected");
  markConnected("hands");
  setHandsConnection(ws);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as InboundMessage;

      if (msg.type === "action_result") {
        resolveAction(msg.id, msg.success, msg.output, msg.error);
      } else if (msg.type === "hands_ready") {
        console.log("[Hands] Capabilities:", msg.capabilities.join(", "));
      }
    } catch (e) {
      console.warn("[Hands] Invalid message:", (e as Error).message);
    }
  });

  ws.on("close", () => {
    console.log("[Hands] Disconnected");
    markDisconnected("hands");
    setHandsConnection(null);
  });

  ws.on("error", (e) => {
    console.error("[Hands] Error:", e.message);
  });
}
