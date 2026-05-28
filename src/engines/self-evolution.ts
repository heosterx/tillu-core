/**
 * self-evolution.ts — Learns from every interaction.
 *
 * After each conversation, checks if Heoster:
 *   1. Expressed a preference or fact worth remembering
 *   2. Defined a new automation ("whenever I say X, do Y")
 *
 * Uses the router writer to parse intent, then writes to memory or creates a skill.
 */

import { routeWriter } from "../brain/providers/router";
import { writeMemory } from "../tools/memory.tool";
import { createSkillFromVoice } from "./skill-engine";
import type { SkillStep } from "../types";

interface EvolutionResult {
  preferenceDetected: boolean;
  preferenceText?: string;
  preferenceType?: "fact" | "preference";
  skillCreationDetected: boolean;
  skillName?: string;
  skillTrigger?: string;
  skillSteps?: Array<{ action: string; params: Record<string, unknown> }>;
}

// Trigger words that suggest something worth learning
const TRIGGER_WORDS = [
  "whenever", "always do", "every time", "remember that",
  "prefer", "i like", "i don't like", "i hate", "i love",
  "make a skill", "create a skill", "automate",
];

/**
 * Analyse an interaction and extract learnable signals.
 * Fire-and-forget — never blocks the main loop.
 */
export async function evolveFromInteraction(
  userInput: string,
  responseText: string,
  sessionId: string
): Promise<void> {
  const lower = userInput.toLowerCase();
  const hasTrigger = TRIGGER_WORDS.some(w => lower.includes(w));
  if (!hasTrigger) return;

  try {
    const prompt = `You are TILLU's Self-Evolution Engine. Analyse this user input and extract learnings.

Return ONLY valid JSON matching this shape:
{
  "preferenceDetected": boolean,
  "preferenceText": "short fact to remember, e.g. Heoster prefers brief answers",
  "preferenceType": "fact" | "preference",
  "skillCreationDetected": boolean,
  "skillName": "snake_case_name",
  "skillTrigger": "the phrase that activates it",
  "skillSteps": [{ "action": "hands|search|voice|memory_write", "params": {} }]
}

User input: "${userInput.slice(0, 300)}"
Tillu response: "${responseText.slice(0, 200)}"

JSON only, no explanation:`;

    const raw = await routeWriter(
      [{ role: "user", content: prompt }],
      { maxTokens: 400, temperature: 0 }
    );

    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const result = JSON.parse(cleaned) as EvolutionResult;

    if (result.preferenceDetected && result.preferenceText) {
      console.log(`[SelfEvolution] Learned: "${result.preferenceText}"`);
      await writeMemory(
        result.preferenceText,
        result.preferenceType ?? "preference",
        "high",
        sessionId
      );
    }

    if (
      result.skillCreationDetected &&
      result.skillName &&
      result.skillTrigger &&
      result.skillSteps?.length
    ) {
      console.log(`[SelfEvolution] Creating skill: ${result.skillName} → "${result.skillTrigger}"`);

      const steps: SkillStep[] = result.skillSteps.map(s => ({
        action: s.action,
        params: s.params,
        on_failure: "skip" as const,
      }));

      const ok = await createSkillFromVoice(
        result.skillName,
        result.skillTrigger,
        steps,
        `Auto-created from: "${userInput.slice(0, 80)}"`
      );

      if (ok) {
        await writeMemory(
          `Created skill "${result.skillName}" triggered by "${result.skillTrigger}"`,
          "event",
          "high",
          sessionId
        );
      }
    }
  } catch (e) {
    // Silent — self-evolution is best-effort, never crashes the loop
    console.warn("[SelfEvolution] Failed:", (e as Error).message.slice(0, 60));
  }
}
