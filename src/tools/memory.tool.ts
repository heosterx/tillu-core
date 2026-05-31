import axios from "axios";
import { config } from "../config";

const BASE = config.services.memoryUrl;
const USER_ID = config.heoster.userId;

/**
 * Load full context bundle before every decision.
 * Calls the new /memory/context endpoint.
 */
export async function loadContext(sessionId: string, message?: string): Promise<{
  working_memory: unknown[];
  pinned_facts: string[];
  relevant_past: unknown[];
  profile: Record<string, unknown>;
  dream_state: Record<string, unknown>;
  upcoming_birthdays: unknown[];
  last_action: unknown;
  summary: string;
}> {
  try {
    const { data } = await axios.post(`${BASE}/memory/context`, {
      user_id: USER_ID,
      session_id: sessionId,
      message,
    }, { timeout: 8000 });

    // Build a one-line summary for prompts
    const pinned = (data.pinned_facts as string[]).slice(0, 3).join("; ");
    const lastMsg = (data.working_memory as Array<{ content: string }>).slice(-1)[0]?.content ?? "";
    const summary = `Pinned: ${pinned || "none"}. Last message: ${lastMsg.slice(0, 100) || "none"}`;

    return { ...data, summary };
  } catch (e) {
    console.warn("[Memory] loadContext failed:", (e as Error).message);
    return {
      working_memory: [],
      pinned_facts: [],
      relevant_past: [],
      profile: {},
      dream_state: {},
      upcoming_birthdays: [],
      last_action: null,
      summary: "No context available",
    };
  }
}

/**
 * Write a new memory fact.
 */
export async function writeMemory(
  content: string,
  type: string,
  importance = "normal",
  sessionId?: string
): Promise<void> {
  try {
    await axios.post(`${BASE}/memory/write`, {
      user_id: USER_ID,
      content,
      type,
      importance,
      session_id: sessionId,
    }, { timeout: 15000 });  // 15s — Jina embed + Supabase write
  } catch (e) {
    console.warn("[Memory] writeMemory failed:", (e as Error).message);
  }
}

/**
 * Semantic search over memories.
 */
export async function searchMemory(query: string, topK = 5): Promise<unknown[]> {
  try {
    const { data } = await axios.post(`${BASE}/memory/search`, {
      user_id: USER_ID,
      query,
      top_k: topK,
    }, { timeout: 8000 });
    return data.results ?? [];
  } catch (e) {
    console.warn("[Memory] searchMemory failed:", (e as Error).message);
    return [];
  }
}

/**
 * Consolidate session to long-term memory.
 */
export async function consolidateSession(sessionId: string): Promise<void> {
  try {
    await axios.post(`${BASE}/memory/consolidate`, {
      user_id: USER_ID,
      session_id: sessionId,
    }, { timeout: 30000 });
  } catch (e) {
    console.warn("[Memory] consolidate failed:", (e as Error).message);
  }
}

/**
 * Get upcoming birthdays.
 */
export async function getUpcomingBirthdays(days = 3): Promise<unknown[]> {
  try {
    const { data } = await axios.get(`${BASE}/memory/birthdays`, {
      params: { user_id: USER_ID, days },
      timeout: 5000,
    });
    return data.birthdays ?? [];
  } catch (e) {
    console.warn("[Memory] getUpcomingBirthdays failed:", (e as Error).message);
    return [];
  }
}

/**
 * Get latest prepared briefing.
 */
export async function getLatestBriefing(): Promise<{ content: string; ready: boolean } | null> {
  try {
    const { data } = await axios.get(`${BASE}/memory/briefing`, {
      params: { user_id: USER_ID, mark_delivered: "true" },
      timeout: 5000,
    });
    return data.ready ? { content: data.briefing?.content ?? "", ready: true } : null;
  } catch (e) {
    console.warn("[Memory] getLatestBriefing failed:", (e as Error).message);
    return null;
  }
}

/**
 * Store a prepared morning briefing.
 */
export async function storeBriefing(content: string, extras?: {
  newsSummary?: string;
  weather?: string;
  calendarEvents?: string[];
}): Promise<void> {
  try {
    await axios.post(`${BASE}/memory/briefing`, {
      user_id: USER_ID,
      content,
      news_summary: extras?.newsSummary,
      weather: extras?.weather,
      calendar_events: extras?.calendarEvents,
    }, { timeout: 15000 });
  } catch (e) {
    console.warn("[Memory] storeBriefing failed:", (e as Error).message);
  }
}

/**
 * Update Dream Loop state.
 */
export async function updateDreamState(updates: Record<string, unknown>): Promise<void> {
  try {
    await axios.patch(`${BASE}/memory/dream-state`, {
      user_id: USER_ID,
      updates,
    }, { timeout: 15000 });
  } catch (e) {
    console.warn("[Memory] updateDreamState failed:", (e as Error).message);
  }
}

/**
 * Log a completed action for Self-Evolution Engine.
 */
export async function logAction(
  actionId: string,
  actionType: string,
  success: boolean,
  skillName?: string,
  latencyMs?: number
): Promise<void> {
  try {
    await axios.post(`${BASE}/memory/action-log`, {
      user_id: USER_ID,
      action_id: actionId,
      action_type: actionType,
      success,
      skill_name: skillName,
      latency_ms: latencyMs,
    }, { timeout: 15000 });
  } catch (e) {
    console.warn("[Memory] logAction failed:", (e as Error).message);
  }
}

/**
 * Record skill performance feedback.
 */
export async function recordSkillFeedback(
  skillName: string,
  executionId: string,
  success: boolean,
  stepsCompleted: number,
  stepsTotal: number,
  latencyMs: number,
  heosterContinued = false
): Promise<void> {
  try {
    await axios.post(`${BASE}/memory/skill-feedback`, {
      user_id: USER_ID,
      skill_name: skillName,
      execution_id: executionId,
      success,
      steps_completed: stepsCompleted,
      steps_total: stepsTotal,
      latency_ms: latencyMs,
      heoster_continued: heosterContinued,
    }, { timeout: 15000 });
  } catch (e) {
    console.warn("[Memory] recordSkillFeedback failed:", (e as Error).message);
  }
}
