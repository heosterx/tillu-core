import { v4 as uuidv4 } from "uuid";
import type WebSocket from "ws";
import type { OutboundHandsMessage } from "../types";

// Hands WebSocket connection — set by ws/hands-handler.ts
let handsWs: WebSocket | null = null;
const pendingActions = new Map<string, {
  resolve: (output: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>();

interface QueuedAction {
  id: string;
  action: string;
  params: Record<string, unknown>;
  timestamp: number;
}
const offlineQueue: QueuedAction[] = [];

export function setHandsConnection(ws: WebSocket | null): void {
  handsWs = ws;
}

export function isHandsConnected(): boolean {
  return handsWs !== null && handsWs.readyState === 1; // OPEN
}

/**
 * Send an action to Tillu-Hands and wait for the result.
 * Times out after 30 seconds.
 */
export async function executeAction(
  action: string,
  params: Record<string, unknown>
): Promise<{ success: boolean; output: unknown; error?: string }> {
  const id = uuidv4();

  if (!isHandsConnected()) {
    offlineQueue.push({ id, action, params, timestamp: Date.now() });
    console.log(`[Hands] Offline. Queued action: ${action}`);
    return { success: true, output: "Action queued because Hands is offline. It will execute upon reconnection." };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingActions.delete(id);
      resolve({ success: false, output: null, error: "Action timed out after 30s" });
    }, 30000);

    pendingActions.set(id, {
      resolve: (output) => {
        clearTimeout(timeout);
        pendingActions.delete(id);
        resolve({ success: true, output });
      },
      reject: (err) => {
        clearTimeout(timeout);
        pendingActions.delete(id);
        resolve({ success: false, output: null, error: err.message });
      },
      timeout,
    });

    const msg: OutboundHandsMessage = { type: "action", id, action, params };
    handsWs!.send(JSON.stringify(msg));
  });
}

/**
 * Called by hands-handler when an action_result arrives.
 */
export function resolveAction(
  id: string,
  success: boolean,
  output: unknown,
  error?: string
): void {
  const pending = pendingActions.get(id);
  if (!pending) return;

  if (success) {
    pending.resolve(output);
  } else {
    pending.reject(new Error(error ?? "Action failed"));
  }
}

export function flushQueue(): void {
  if (!isHandsConnected() || offlineQueue.length === 0) return;
  
  console.log(`[Hands] Flushing ${offlineQueue.length} queued actions`);
  for (const q of offlineQueue) {
    const msg: OutboundHandsMessage = { type: "action", id: q.id, action: q.action, params: q.params };
    handsWs!.send(JSON.stringify(msg));
  }
  offlineQueue.length = 0;
}
