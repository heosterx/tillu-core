import { v4 as uuidv4 } from "uuid";
import { runPipeline } from "../brain/pipeline";
import { executeAction, isHandsConnected } from "../tools/hands.tool";
import { search, formatSearchResult } from "../tools/search.tool";
import { see } from "../tools/see.tool";
import { speak } from "../tools/voice.tool";
import { writeMemory, logAction, recordSkillFeedback } from "../tools/memory.tool";
import { emitToUI } from "./presence";
import type { ActionStep, TilluOutput, OutboundUIMessage } from "../types";

export interface LoopInput {
  userInput: string;
  contextSummary: string;
  userState?: string;
  sessionId: string;
  image?: string;
  latestScreenshot?: string;
}

/**
 * The main agentic loop.
 * Runs the 4-stage pipeline, then executes response + action in parallel.
 */
export async function runAgenticLoop(input: LoopInput): Promise<void> {
  const { userInput, contextSummary, userState, sessionId } = input;
  const loopStart = Date.now();

  emitToUI({ type: "thought", step: "Thinking...", icon: "brain" });

  // Run pipeline (classify + plan in parallel with write)
  const { output, classification, latency_ms: pipelineMs } = await runPipeline({
    userInput,
    contextSummary,
    userState,
    image: input.image,
  });

  console.log(`[Loop] Pipeline: ${pipelineMs}ms | intent=${classification.intent} | has_response=${classification.has_response} | has_action=${classification.has_action}`);

  // Execute response and action in parallel
  await Promise.all([
    classification.has_response ? executeResponsePath(output, userInput, contextSummary, userState) : Promise.resolve(),
    classification.has_action && !classification.short_circuit ? executeActionPath(output, sessionId) : Promise.resolve(),
  ]);

  // Save interaction to memory
  void writeMemory(
    `Heoster asked: "${userInput.slice(0, 200)}"`,
    "event",
    "normal",
    sessionId
  );

  console.log(`[Loop] Total: ${Date.now() - loopStart}ms`);
}

// ─── Response Path ────────────────────────────────────────────────────────────

async function executeResponsePath(
  output: TilluOutput,
  userInput: string,
  contextSummary: string,
  userState?: string
): Promise<void> {
  if (!output.response) return;

  let responseText = output.response.text;

  // If there are tool results from action path, we may need to enrich the response
  // For now emit what we have — the writer already used context
  emitToUI({ type: "response_text", text: responseText });

  // Get audio
  const audioUrl = await speak(responseText, output.response.lang ?? "hi");
  if (audioUrl) {
    emitToUI({ type: "response_audio", audio_url: audioUrl });
  }
}

// ─── Action Path ──────────────────────────────────────────────────────────────

async function executeActionPath(output: TilluOutput, sessionId: string): Promise<void> {
  if (!output.action || output.action.plan.length === 0) return;

  const action = output.action;
  const actionStart = Date.now();

  // Emit action plan to UI
  emitToUI({ type: "action_start", action_id: action.id, plan: action.plan });

  // Handle confirmation gate
  if (action.requires_confirmation) {
    emitToUI({
      type: "action_confirm",
      action_id: action.id,
      message: action.confirmation_message ?? "Confirm this action?",
      pending_step: action.plan[0],
    });
    // Actual execution waits for confirm message from UI (handled in ui-handler.ts)
    return;
  }

  // Execute each step
  let allSucceeded = true;
  const toolResults: string[] = [];

  for (const step of action.plan) {
    emitToUI({
      type: "action_step",
      action_id: action.id,
      step_id: step.id,
      status: "running",
    });

    const result = await executeStep(step);

    if (result.success) {
      step.status = "done";
      step.output = result.output;
      if (result.summary) toolResults.push(result.summary);
      emitToUI({
        type: "action_step",
        action_id: action.id,
        step_id: step.id,
        status: "done",
        output: result.output,
      });
    } else {
      step.status = "failed";
      step.error = result.error;
      allSucceeded = false;
      emitToUI({
        type: "action_step",
        action_id: action.id,
        step_id: step.id,
        status: "failed",
        error: result.error,
      });

      // Abort on failure unless step policy is skip
      break;
    }
  }

  emitToUI({ type: "action_done", action_id: action.id, success: allSucceeded });

  // Log action for Self-Evolution Engine
  void logAction(
    action.id,
    action.plan[0]?.action ?? "unknown",
    allSucceeded,
    undefined,
    Date.now() - actionStart
  );

  // If we got tool results, emit a follow-up response card
  if (toolResults.length > 0) {
    emitToUI({
      type: "response_card",
      card_type: "action_result",
      data: { results: toolResults, success: allSucceeded },
    });
  }
}

// ─── Step Executor ────────────────────────────────────────────────────────────

async function executeStep(step: ActionStep): Promise<{
  success: boolean;
  output: unknown;
  summary?: string;
  error?: string;
}> {
  try {
    switch (step.tool) {
      case "search": {
        emitToUI({ type: "thought", step: `Searching: ${(step.params.query as string) ?? "..."}`, icon: "search" });
        const result = await search(
          step.params.query as string,
          (step.params.mode as "fast" | "full") ?? "fast",
          (step.params.category as "general" | "news" | "videos") ?? "general"
        );
        return { success: true, output: result, summary: formatSearchResult(result) };
      }

      case "see": {
        emitToUI({ type: "thought", step: `Analyzing image...`, icon: "eye" });
        // Screenshot should be provided by Sense — use latest if available
        const imageBase64 = step.params.image as string ?? "";
        if (!imageBase64) return { success: false, output: null, error: "No image provided for see tool" };
        const result = await see(
          step.params.task as "screen_read" | "ocr" | "describe" | "visual_qa",
          imageBase64,
          step.params.question as string | undefined
        );
        return { success: true, output: result, summary: result.description };
      }

      case "hands": {
        if (!isHandsConnected()) {
          return { success: false, output: null, error: "Tillu-Hands is not connected" };
        }
        emitToUI({ type: "thought", step: `${step.action}...`, icon: "hand" });
        const result = await executeAction(step.action, step.params);
        return {
          success: result.success,
          output: result.output,
          error: result.error,
          summary: result.success ? `${step.action} completed` : undefined,
        };
      }

      case "browser": {
        if (!isHandsConnected()) {
          return { success: false, output: null, error: "Tillu-Hands is not connected" };
        }
        emitToUI({ type: "thought", step: `Browsing ${step.params.url ?? "..."}`, icon: "browser" });
        const result = await executeAction(step.action, step.params);
        return { success: result.success, output: result.output, error: result.error };
      }

      case "voice": {
        const audioUrl = await speak(step.params.text as string, step.params.lang as string ?? "hi");
        return { success: true, output: { audio_url: audioUrl } };
      }

      case "memory": {
        await writeMemory(
          step.params.content as string,
          step.params.type as string ?? "fact",
          step.params.importance as string ?? "normal"
        );
        return { success: true, output: { saved: true } };
      }

      default:
        return { success: false, output: null, error: `Unknown tool: ${step.tool}` };
    }
  } catch (e) {
    return { success: false, output: null, error: (e as Error).message };
  }
}
