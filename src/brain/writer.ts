import { callGoogle } from "./providers/google";
import { callGroq } from "./providers/groq";
import { callOpenRouter } from "./providers/openrouter";
import { callHuggingFace } from "./providers/huggingface";
import { writerPrompt, wakeUpPrompt, morningBriefingPrompt } from "./prompts";
import { getISTTimeOfDay } from "../utils/time";

/**
 * Stage 3: Write the final response.
 * Provider chain: Gemini → Groq → OpenRouter → HF
 * Target latency: ~800ms
 */
export async function write(
  userInput: string,
  toolResults: string,
  contextSummary: string,
  userState?: string
): Promise<string> {
  const prompt = writerPrompt(userInput, toolResults, contextSummary, userState);
  const messages = [{ role: "user" as const, content: prompt }];

  // 1. Gemini — best for natural, warm text
  try {
    return await callGoogle(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] Gemini failed:", (e as Error).message);
  }

  // 2. Groq — fast fallback
  try {
    return await callGroq(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] Groq failed:", (e as Error).message);
  }

  // 3. OpenRouter
  try {
    return await callOpenRouter(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] OpenRouter failed:", (e as Error).message);
  }

  // 4. HuggingFace — last resort
  try {
    return await callHuggingFace(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] HuggingFace failed:", (e as Error).message);
  }

  // Absolute fallback — plain text
  return `I processed your request, Heoster. ${toolResults ? `Here's what I found: ${toolResults.slice(0, 200)}` : ""}`;
}

/**
 * Generate the wake-up greeting when Heoster comes online.
 * Uses Gemini for the most personal, warm output.
 */
export async function writeWakeUpGreeting(options: {
  lastSessionSummary: string;
  todayEvents: string;
  upcomingBirthdays: string;
  briefingContent: string;
}): Promise<string> {
  const timeOfDay = getISTTimeOfDay();
  const prompt = wakeUpPrompt(
    timeOfDay,
    options.lastSessionSummary,
    options.todayEvents,
    options.upcomingBirthdays,
    options.briefingContent
  );
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await callGoogle(messages, { maxTokens: 200, temperature: 0.8 });
  } catch {
    try {
      return await callGroq(messages, { maxTokens: 200, temperature: 0.8 });
    } catch {
      const greetings = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" };
      return `${greetings[timeOfDay]} Heoster! I'm ready whenever you are.`;
    }
  }
}

/**
 * Write the morning briefing during Dream Loop.
 */
export async function writeMorningBriefing(options: {
  newsHeadlines: string;
  weather: string;
  todayEvents: string;
  upcomingBirthdays: string;
}): Promise<string> {
  const prompt = morningBriefingPrompt(
    options.newsHeadlines,
    options.weather,
    options.todayEvents,
    options.upcomingBirthdays
  );
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await callGoogle(messages, { maxTokens: 300, temperature: 0.6 });
  } catch {
    try {
      return await callGroq(messages, { maxTokens: 300, temperature: 0.6 });
    } catch {
      return `Good morning Heoster! Here's your briefing: ${options.newsHeadlines.slice(0, 200)}`;
    }
  }
}
