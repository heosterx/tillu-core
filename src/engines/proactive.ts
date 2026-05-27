/**
 * Proactive Engine — Tillu initiates conversations without waiting for user input.
 *
 * Tillu is not a chatbot that waits. It notices things and speaks up.
 * This engine runs checks and fires messages to UI when something is worth saying.
 *
 * Triggers:
 *   - Heoster just came online (wake-up — handled by presence.ts)
 *   - Exam/event in N days (calendar check)
 *   - Birthday coming up
 *   - Heoster idle after long work session
 *   - Interesting news on tracked topics
 *   - Dream Loop prepared a briefing
 *   - Tillu noticed a pattern (same app for 30+ min)
 */

import { emitToUI, isOnline } from "./presence";
import { writeProactiveMessage } from "../brain/writer";
import { speak } from "../tools/voice.tool";
import { getUpcomingBirthdays, searchMemory } from "../tools/memory.tool";
import { search } from "../tools/search.tool";
import { getISTTime } from "../utils/time";
import type { SenseContext } from "../types";

// ─── Cooldown tracker — prevent spamming ─────────────────────────────────────

const cooldowns = new Map<string, number>();

function isOnCooldown(key: string, minutes: number): boolean {
  const last = cooldowns.get(key);
  if (!last) return false;
  return Date.now() - last < minutes * 60 * 1000;
}

function setCooldown(key: string): void {
  cooldowns.set(key, Date.now());
}

// ─── Emit a proactive message to UI ──────────────────────────────────────────

async function fireProactive(
  trigger: string,
  context: string,
  data: string,
  cooldownKey: string,
  cooldownMinutes: number
): Promise<void> {
  if (isOnCooldown(cooldownKey, cooldownMinutes)) return;
  if (!isOnline()) return;

  setCooldown(cooldownKey);

  const text = await writeProactiveMessage({ trigger, context, data });
  if (!text) return;

  const audioUrl = await speak(text, "hi");

  emitToUI({
    type: "proactive",
    message: text,
    recipe: trigger,
  });

  if (audioUrl) {
    emitToUI({ type: "response_audio", audio_url: audioUrl });
  }

  console.log(`[Proactive] Fired: ${trigger} — "${text.slice(0, 80)}"`);
}

// ─── Trigger: Upcoming birthdays ─────────────────────────────────────────────

export async function checkBirthdays(): Promise<void> {
  if (!isOnline()) return;

  try {
    const birthdays = await getUpcomingBirthdays(3) as Array<{
      person_name: string;
      relation?: string;
      days_until: number;
    }>;

    for (const b of birthdays) {
      const key = `birthday_${b.person_name}`;
      if (isOnCooldown(key, 1440)) continue; // once per day per person

      await fireProactive(
        "upcoming_birthday",
        `Heoster is online. ${b.person_name}'s birthday is coming up.`,
        `${b.person_name} (${b.relation ?? "friend"}) — ${b.days_until} day${b.days_until === 1 ? "" : "s"} away`,
        key,
        1440
      );
    }
  } catch (e) {
    console.warn("[Proactive] Birthday check failed:", (e as Error).message);
  }
}

// ─── Trigger: Idle after long work session ────────────────────────────────────

export async function checkIdleAfterWork(ctx: SenseContext): Promise<void> {
  if (!isOnline()) return;

  // Idle for 10+ minutes after being active for a while
  if (ctx.idle_seconds < 600) return;
  if (ctx.user_state !== "idle") return;

  await fireProactive(
    "idle_after_work",
    "Heoster has been idle for 10+ minutes after an active session.",
    `Last active app: ${ctx.active_app}. Idle for ${Math.round(ctx.idle_seconds / 60)} minutes.`,
    "idle_after_work",
    60 // once per hour
  );
}

// ─── Trigger: Same app for 30+ minutes (deep focus) ──────────────────────────

let focusAppStart: { app: string; startTime: number } | null = null;

export async function checkDeepFocus(ctx: SenseContext): Promise<void> {
  if (!isOnline()) return;

  const now = Date.now();

  if (!focusAppStart || focusAppStart.app !== ctx.active_app) {
    focusAppStart = { app: ctx.active_app, startTime: now };
    return;
  }

  const minutesInApp = (now - focusAppStart.startTime) / 60000;

  // 30 minutes in same app — check in
  if (minutesInApp >= 30 && !isOnCooldown(`focus_${ctx.active_app}`, 60)) {
    await fireProactive(
      "deep_focus",
      `Heoster has been in ${ctx.active_app} for ${Math.round(minutesInApp)} minutes.`,
      `App: ${ctx.active_app}. URL: ${ctx.active_url || "none"}`,
      `focus_${ctx.active_app}`,
      60
    );
  }
}

// ─── Trigger: Tracked topic news (called from Dream Loop) ────────────────────

export async function checkTrackedTopics(): Promise<void> {
  if (!isOnline()) return;
  if (isOnCooldown("tracked_topics", 120)) return; // every 2 hours max

  try {
    const topicMemories = await searchMemory("tracked topics interests", 3) as Array<{ content: string }>;
    const topics = topicMemories.map((m) => m.content).join(", ");
    if (!topics) return;

    const result = await search(`latest news ${topics}`, "fast", "news");
    if (!result.answer || result.answer.startsWith("Search failed")) return;

    await fireProactive(
      "tracked_topic_update",
      `Heoster tracks: ${topics}`,
      result.answer.slice(0, 200),
      "tracked_topics",
      120
    );
  } catch (e) {
    console.warn("[Proactive] Tracked topics check failed:", (e as Error).message);
  }
}

// ─── Trigger: Time-based (exam countdown, morning reminder) ──────────────────

export async function checkTimeBasedTriggers(): Promise<void> {
  if (!isOnline()) return;

  const time = getISTTime();

  // Morning check-in at 9 AM if no briefing was delivered
  if (time.includes("09:0") && !isOnCooldown("morning_checkin", 1440)) {
    await fireProactive(
      "morning_checkin",
      "It's 9 AM IST. Heoster is online.",
      `Current time: ${time}`,
      "morning_checkin",
      1440
    );
  }
}

// ─── Main proactive tick — called by sense-handler on context updates ─────────

export async function runProactiveTick(ctx: SenseContext): Promise<void> {
  // Run all checks in parallel, failures are isolated
  await Promise.allSettled([
    checkIdleAfterWork(ctx),
    checkDeepFocus(ctx),
    checkTimeBasedTriggers(),
  ]);
}

// ─── Startup proactive check — called once when Heoster comes online ──────────

export async function runOnlineChecks(): Promise<void> {
  await Promise.allSettled([
    checkBirthdays(),
    checkTrackedTopics(),
  ]);
}
