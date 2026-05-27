import { callGoogle } from "./providers/google";
import { callTogether } from "./providers/together";
import { callGroq } from "./providers/groq";
import { callOpenRouter } from "./providers/openrouter";
import { callHuggingFace } from "./providers/huggingface";
import { writerPrompt, wakeUpPrompt, morningBriefingPrompt, proactivePrompt } from "./prompts";
import { getISTTimeOfDay } from "../utils/time";

/**
 * Stage 3: Write the final response.
 * Provider chain: Gemini → Together AI → OpenRouter → Groq → HF
 *
 * Together AI (Llama-3.3-70B-Turbo-Free) is the quality fallback when Gemini is unavailable.
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
    console.warn("[Writer] Gemini failed:", (e as Error).message.slice(0, 80));
  }

  // 2. Together AI — free Llama-3.3-70B-Turbo, quality fallback
  try {
    return await callTogether(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] Together AI failed:", (e as Error).message.slice(0, 80));
  }

  // 3. OpenRouter — free llama fallback
  try {
    return await callOpenRouter(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] OpenRouter failed:", (e as Error).message.slice(0, 80));
  }

  // 4. Groq — fast fallback
  try {
    return await callGroq(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] Groq failed:", (e as Error).message.slice(0, 80));
  }

  // 5. HuggingFace — last resort
  try {
    return await callHuggingFace(messages, { maxTokens: 256, temperature: 0.7 });
  } catch (e) {
    console.warn("[Writer] HuggingFace failed:", (e as Error).message.slice(0, 80));
  }

  // Absolute fallback
  return `I processed your request, Heoster. ${toolResults ? `Here's what I found: ${toolResults.slice(0, 200)}` : ""}`;
}

/**
 * Generate the wake-up greeting when Heoster comes online.
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
      return await callTogether(messages, { maxTokens: 200, temperature: 0.8 });
    } catch {
      try {
        return await callGroq(messages, { maxTokens: 200, temperature: 0.8 });
      } catch {
        const greetings = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening", night: "Good night" };
        return `${greetings[timeOfDay]} Heoster! I'm ready whenever you are.`;
      }
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
      return await callTogether(messages, { maxTokens: 300, temperature: 0.6 });
    } catch {
      try {
        return await callGroq(messages, { maxTokens: 300, temperature: 0.6 });
      } catch {
        return `Good morning Heoster! Here's your briefing: ${options.newsHeadlines.slice(0, 200)}`;
      }
    }
  }
}

/**
 * Write a proactive message Tillu initiates without user input.
 * Used by the proactive engine when Tillu has something to say.
 */
export async function writeProactiveMessage(options: {
  trigger: string;       // what triggered this (e.g. "exam_in_3_days", "idle_after_work")
  context: string;       // relevant context
  data?: string;         // any data to include (news, birthday info, etc.)
}): Promise<string> {
  const prompt = proactivePrompt(options.trigger, options.context, options.data ?? "");
  const messages = [{ role: "user" as const, content: prompt }];

  try {
    return await callGoogle(messages, { maxTokens: 150, temperature: 0.8 });
  } catch {
    try {
      return await callTogether(messages, { maxTokens: 150, temperature: 0.8 });
    } catch {
      try {
        return await callGroq(messages, { maxTokens: 150, temperature: 0.8 });
      } catch {
        return "";
      }
    }
  }
}
