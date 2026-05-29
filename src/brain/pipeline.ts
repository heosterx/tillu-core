import { v4 as uuidv4 } from "uuid";
import { classify } from "./classifier";
import { plan } from "./planner";
import { write } from "./writer";
import { search, formatSearchResult } from "../tools/search.tool";
import { getNews, getWeather, formatNews, formatWeather } from "../tools/news-weather.tool";
import { searchMemory } from "../tools/memory.tool";
import { see } from "../tools/see.tool";
import type {
  ClassifierOutput,
  TilluOutput,
  TilluAction,
  TilluResponse,
  ActionStep,
  ToolCall,
} from "../types";

export interface PipelineInput {
  userInput: string;
  contextSummary: string;
  userState?: string;
  image?: string;
  latestScreenshot?: string;
}

export interface PipelineResult {
  output: TilluOutput;
  classification: ClassifierOutput;
  latency_ms: number;
}

/**
 * The 4-stage pipeline:
 *   Stage 1: Classify  — intent + routing
 *   Stage 2: Plan      — tool calls
 *   Stage 3: Execute   — run cloud tools (search, memory, see) to get real data
 *   Stage 4: Write     — response using actual tool results
 *   Stage 5: Voice     — handled by agentic-loop after pipeline
 *
 * Cloud tools (search, memory_read, see) run BEFORE the writer so responses
 * contain real data. Desktop tools (hands, browser, calendar) are queued as
 * ActionSteps and executed by the agentic-loop in parallel with voice.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e as Error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw lastError;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const start = Date.now();
  const { userInput, contextSummary, userState, image, latestScreenshot } = input;

  // ── Stage 1: Classify ──────────────────────────────────────────────────────
  const classification = await classify(userInput, contextSummary);

  // ── Short-circuit: simple conversation/question, no tools ─────────────────
  if (classification.short_circuit || !classification.has_action) {
    const text = await write(userInput, `Context: ${contextSummary}`, contextSummary, userState);
    return {
      output: {
        response: { text, lang: "hi-en" },
        action: null,
      },
      classification,
      latency_ms: Date.now() - start,
    };
  }

  // ── Stage 2: Plan ──────────────────────────────────────────────────────────
  const planResult = await plan(classification.intent, userInput, contextSummary);

  if (planResult.tool_calls.length === 0) {
    // Planner returned nothing — write directly
    const text = await write(userInput, `Context: ${contextSummary}`, contextSummary, userState);
    return {
      output: {
        response: classification.has_response ? { text, lang: "hi-en" } : null,
        action: null,
      },
      classification,
      latency_ms: Date.now() - start,
    };
  }

  // ── Stage 3: Execute cloud tools immediately, queue desktop tools ──────────
  const cloudResults: string[] = [];
  const desktopSteps: ActionStep[] = [];

  for (const tc of planResult.tool_calls) {
    const toolName = tc.tool;

    if (toolName === "news") {
      // Execute news fetch NOW — writer needs the headlines
      try {
        const result = await getNews(tc.params.query as string ?? "India top headlines");
        const formatted = formatNews(result);
        if (formatted) cloudResults.push(formatted);
      } catch (e) {
        console.warn("[Pipeline] News failed:", (e as Error).message);
      }

    } else if (toolName === "weather") {
      // Execute weather fetch NOW — writer needs current conditions
      try {
        const city = tc.params.city as string ?? "Muzaffarnagar";
        const result = await getWeather(city);
        const formatted = formatWeather(result);
        if (formatted) cloudResults.push(formatted);
      } catch (e) {
        console.warn("[Pipeline] Weather failed:", (e as Error).message);
      }

    } else if (toolName === "search") {
      // Execute search NOW — writer needs the results
      try {
        const result = await withRetry(() => search(
          tc.params.query as string,
          (tc.params.mode as "fast" | "full") ?? "fast",
          (tc.params.category as "general" | "news" | "videos") ?? "general"
        ));
        const formatted = formatSearchResult(result);
        if (formatted) cloudResults.push(`[Search: ${tc.params.query}]\n${formatted}`);
      } catch (e) {
        console.warn("[Pipeline] Search failed after retries:", (e as Error).message);
      }

    } else if (toolName === "memory_read") {
      // Execute memory search NOW — writer needs context
      try {
        const memories = await withRetry(() => searchMemory(tc.params.query as string, 5)) as Array<{ content: string }>;
        if (memories.length > 0) {
          const memText = memories.map(m => m.content).join("; ");
          cloudResults.push(`[Memory: ${tc.params.query}]\n${memText}`);
        }
      } catch (e) {
        console.warn("[Pipeline] Memory read failed after retries:", (e as Error).message);
      }

    } else if (toolName === "see") {
      // Execute vision NOW if image is available
      const imgData = image ?? latestScreenshot ?? "";
      if (imgData) {
        try {
          const result = await withRetry(() => see(
            (tc.params.task as "screen_read" | "ocr" | "describe" | "visual_qa") ?? "describe",
            imgData,
            tc.params.question as string | undefined
          ));
          if (result.description) cloudResults.push(`[Vision]\n${result.description}`);
        } catch (e) {
          console.warn("[Pipeline] See failed after retries:", (e as Error).message);
        }
      }

    } else {
      // Desktop tools (hands, browser, calendar, memory_write, speak, create_skill)
      // → queue as ActionStep for agentic-loop to execute
      desktopSteps.push({
        id: uuidv4(),
        tool: toolName as ActionStep["tool"],
        action: toolName,
        params: tc.params,
        status: "pending",
      });
    }
  }

  // ── Stage 4: Write with real tool results ──────────────────────────────────
  const toolResultsText = cloudResults.join("\n\n") || `Context: ${contextSummary}`;

  let response: TilluResponse | null = null;
  if (classification.has_response) {
    const text = await write(userInput, toolResultsText, contextSummary, userState);
    response = { text, lang: "hi-en" };
  }

  // Build action plan from desktop steps
  let action: TilluAction | null = null;
  if (desktopSteps.length > 0) {
    action = {
      id: uuidv4(),
      plan: desktopSteps,
      status: "pending",
      requires_confirmation: classification.needs_confirmation,
      confirmation_message: classification.needs_confirmation
        ? `I'm about to ${desktopSteps[0]?.action ?? "perform an action"}. Confirm?`
        : undefined,
    };
  }

  return {
    output: { response, action },
    classification,
    latency_ms: Date.now() - start,
  };
}
