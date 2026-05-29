import cron from "node-cron";
import { search } from "../tools/search.tool";
import { getNews, getWeather } from "../tools/news-weather.tool";
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

// In-memory dream state (persisted to Memory service after each cycle)
const dreamState = {
  last_consolidated: null as string | null,
  last_briefing_prepared: null as string | null,
  last_world_monitor: null as string | null,
};

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
    // Fetch news, weather, birthdays in parallel — use dedicated news/weather service
    const [newsResult, weatherResult, birthdays] = await Promise.all([
      getNews("world news today India"),
      getWeather("Muzaffarnagar"),
      getUpcomingBirthdays(7),
    ]);

    const newsHeadlines = newsResult.articles.slice(0, 3).map(a => a.title).join(". ") ||
                          newsResult.summary.slice(0, 300);
    const weather = weatherResult.summary;
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
    dreamState.last_briefing_prepared = nowISO();

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
    const sessionId = `sess_${new Date().toISOString().split("T")[0]}`;
    await consolidateSession(sessionId);
    const ts = nowISO();
    await updateDreamState({ last_consolidated: ts });
    dreamState.last_consolidated = ts;
    console.log("[DreamLoop] Memory consolidated");
  } catch (e) {
    console.error("[DreamLoop] Consolidation failed:", (e as Error).message);
  }
}

async function runWorldMonitor(): Promise<void> {
  console.log("[DreamLoop] Running world monitor...");
  try {
    const topicMemories = await searchMemory("tracked topics interests", 3) as Array<{ content: string }>;
    const topics = topicMemories.map((m) => m.content).join(", ") || "India news, technology, cricket";

    // Use dedicated news service for tracked topics
    await getNews(topics);

    const ts = nowISO();
    await updateDreamState({ last_world_monitor: ts });
    dreamState.last_world_monitor = ts;
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
  last_consolidated: string | null;
  last_briefing_prepared: string | null;
  last_world_monitor: string | null;
  next_morning_prep: string;
} {
  const now = new Date();
  const nextMorning = new Date();
  // 5:30 AM IST = 00:00 UTC
  nextMorning.setUTCHours(0, 0, 0, 0);
  if (now >= nextMorning) nextMorning.setDate(nextMorning.getDate() + 1);

  return {
    running: isRunning,
    last_consolidated: dreamState.last_consolidated,
    last_briefing_prepared: dreamState.last_briefing_prepared,
    last_world_monitor: dreamState.last_world_monitor,
    next_morning_prep: nextMorning.toISOString(),
  };
}
