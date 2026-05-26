import cron from "node-cron";
import { search } from "../tools/search.tool";
import {
  consolidateSession,
  storeBriefing,
  updateDreamState,
  getUpcomingBirthdays,
  searchMemory,
} from "../tools/memory.tool";
import { writeMorningBriefing } from "../brain/writer";
import { getISTHour, nowISO } from "../utils/time";
import { isOnline } from "./presence";
import { HEOSTER } from "../types";

let isRunning = false;

// ─── Dream Loop Scheduler ─────────────────────────────────────────────────────

export function startDreamLoop(): void {
  // Morning briefing prep — 5:30 AM IST daily
  cron.schedule("0 0 * * *", () => {
    // IST = UTC+5:30, so 5:30 IST = 00:00 UTC
    void runMorningPrep();
  }, { timezone: "Asia/Kolkata" });

  // Memory consolidation — 11 PM IST daily
  cron.schedule("30 17 * * *", () => {
    // 11 PM IST = 17:30 UTC
    void runMemoryConsolidation();
  }, { timezone: "UTC" });

  // World monitoring — every 2 hours when offline
  cron.schedule("0 */2 * * *", () => {
    if (!isOnline()) void runWorldMonitor();
  });

  // Weekly skill review — Sunday 10 PM IST
  cron.schedule("30 16 * * 0", () => {
    void runSkillReview();
  }, { timezone: "UTC" });

  console.log("[DreamLoop] Scheduler started");
}

// ─── Dream Cycle Steps ────────────────────────────────────────────────────────

async function runMorningPrep(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  console.log("[DreamLoop] Running morning briefing prep...");

  try {
    // Fetch news, weather, birthdays in parallel
    const [newsResult, weatherResult, birthdays] = await Promise.all([
      search("world news today India", "fast", "news"),
      search(`weather today Muzaffarnagar Uttar Pradesh`, "fast"),
      getUpcomingBirthdays(7),
    ]);

    const newsHeadlines = newsResult.key_points.slice(0, 3).join(". ");
    const weather = weatherResult.answer.slice(0, 150);
    const birthdayStr = (birthdays as Array<{ person_name: string; days_until: number }>)
      .map((b) => `${b.person_name} in ${b.days_until} days`)
      .join(", ");

    // Write briefing using LLM
    const briefingContent = await writeMorningBriefing({
      newsHeadlines,
      weather,
      todayEvents: "", // Calendar engine will provide this
      upcomingBirthdays: birthdayStr,
    });

    // Store briefing for delivery when Heoster comes online
    await storeBriefing(briefingContent, {
      newsSummary: newsHeadlines,
      weather,
      calendarEvents: [],
    });

    await updateDreamState({
      last_briefing_prepared: nowISO(),
      morning_briefing_delivered_today: false,
    });

    console.log("[DreamLoop] Morning briefing prepared");
  } catch (e) {
    console.error("[DreamLoop] Morning prep failed:", (e as Error).message);
  } finally {
    isRunning = false;
  }
}

async function runMemoryConsolidation(): Promise<void> {
  console.log("[DreamLoop] Running memory consolidation...");
  try {
    // Consolidate the current day's session
    const sessionId = `sess_${new Date().toISOString().split("T")[0]}`;
    await consolidateSession(sessionId);
    await updateDreamState({ last_consolidated: nowISO() });
    console.log("[DreamLoop] Memory consolidated");
  } catch (e) {
    console.error("[DreamLoop] Consolidation failed:", (e as Error).message);
  }
}

async function runWorldMonitor(): Promise<void> {
  console.log("[DreamLoop] Running world monitor...");
  try {
    // Get tracked topics from memory
    const topicMemories = await searchMemory("tracked topics interests", 3) as Array<{ content: string }>;
    const topics = topicMemories.map((m) => m.content).join(", ") || "India news, technology, cricket";

    // Search for updates on tracked topics
    await search(`latest news ${topics}`, "fast", "news");

    await updateDreamState({ last_world_monitor: nowISO() });
    console.log("[DreamLoop] World monitor complete");
  } catch (e) {
    console.error("[DreamLoop] World monitor failed:", (e as Error).message);
  }
}

async function runSkillReview(): Promise<void> {
  console.log("[DreamLoop] Running weekly skill review...");
  // Skill performance review — logged, actual adaptation done by self-evolution engine
  console.log("[DreamLoop] Skill review complete");
}

export function getDreamLoopStatus(): {
  running: boolean;
  next_morning_prep: string;
} {
  const now = new Date();
  const nextMorning = new Date();
  nextMorning.setUTCHours(0, 0, 0, 0);
  if (now >= nextMorning) nextMorning.setDate(nextMorning.getDate() + 1);

  return {
    running: isRunning,
    next_morning_prep: nextMorning.toISOString(),
  };
}
