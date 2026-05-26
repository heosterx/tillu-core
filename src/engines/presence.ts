import type WebSocket from "ws";
import type { PresenceState, PresenceMode, OutboundUIMessage } from "../types";
import { writeWakeUpGreeting } from "../brain/writer";
import {
  loadContext,
  getUpcomingBirthdays,
  getLatestBriefing,
} from "../tools/memory.tool";
import { speak } from "../tools/voice.tool";
import { HEOSTER } from "../types";

// ─── State ────────────────────────────────────────────────────────────────────

const state: PresenceState = {
  sense_connected: false,
  hands_connected: false,
  ui_connected: false,
  mode: "offline",
  last_seen: null,
};

let uiSocket: WebSocket | null = null;

// ─── Connection management ────────────────────────────────────────────────────

export function setUISocket(ws: WebSocket | null): void {
  uiSocket = ws;
}

export function getPresenceState(): PresenceState {
  return { ...state };
}

export function getMode(): PresenceMode {
  return state.mode;
}

export function isOnline(): boolean {
  return state.mode === "online";
}

export function markConnected(type: "sense" | "hands" | "ui"): void {
  const wasAllConnected = state.sense_connected && state.hands_connected && state.ui_connected;

  if (type === "sense") state.sense_connected = true;
  if (type === "hands") state.hands_connected = true;
  if (type === "ui") state.ui_connected = true;

  state.last_seen = new Date().toISOString();

  const nowAllConnected = state.sense_connected && state.hands_connected && state.ui_connected;

  // All three just connected for the first time → trigger Wake-Up Sequence
  if (!wasAllConnected && nowAllConnected) {
    state.mode = "online";
    console.log("[Presence] All services connected — triggering Wake-Up Sequence");
    void triggerWakeUp();
  } else if (type === "sense") {
    state.mode = "online";
    emitToUI({ type: "mode_change", mode: "online" });
  }
}

export function markDisconnected(type: "sense" | "hands" | "ui"): void {
  if (type === "sense") {
    state.sense_connected = false;
    state.mode = "offline";
    emitToUI({ type: "mode_change", mode: "offline" });
    console.log("[Presence] Sense disconnected — switching to offline mode");
  }
  if (type === "hands") state.hands_connected = false;
  if (type === "ui") {
    state.ui_connected = false;
    uiSocket = null;
  }
}

// ─── Wake-Up Sequence ─────────────────────────────────────────────────────────

async function triggerWakeUp(): Promise<void> {
  try {
    emitToUI({ type: "thought", step: "Waking up...", icon: "power" });

    // Load context in parallel
    const sessionId = `sess_${Date.now()}`;
    const [ctx, birthdays, briefing] = await Promise.all([
      loadContext(sessionId),
      getUpcomingBirthdays(3),
      getLatestBriefing(),
    ]);

    // Build context strings for the greeting
    const lastSessionSummary = ctx.summary ?? "";
    const todayEvents = ""; // Calendar engine will fill this later
    const birthdayStr = (birthdays as Array<{ person_name: string; days_until: number; relation?: string }>)
      .map((b) => `${b.person_name} (${b.relation ?? "friend"}) in ${b.days_until} day${b.days_until === 1 ? "" : "s"}`)
      .join(", ");
    const briefingContent = briefing?.content ?? "";

    emitToUI({ type: "thought", step: "Composing greeting...", icon: "brain" });

    // Generate personalized greeting
    const greetingText = await writeWakeUpGreeting({
      lastSessionSummary,
      todayEvents,
      upcomingBirthdays: birthdayStr,
      briefingContent,
    });

    // Get audio
    const audioUrl = await speak(greetingText, "hi");

    // Deliver to UI
    emitToUI({
      type: "greeting",
      text: greetingText,
      audio_url: audioUrl ?? undefined,
    });

    console.log(`[Presence] Wake-Up delivered to ${HEOSTER.nickname}`);
  } catch (e) {
    console.error("[Presence] Wake-Up Sequence failed:", (e as Error).message);
    emitToUI({
      type: "greeting",
      text: `Welcome back, ${HEOSTER.nickname}!`,
    });
  }
}

// ─── UI emitter ───────────────────────────────────────────────────────────────

export function emitToUI(msg: OutboundUIMessage): void {
  if (uiSocket && uiSocket.readyState === 1) {
    uiSocket.send(JSON.stringify(msg));
  }
}
