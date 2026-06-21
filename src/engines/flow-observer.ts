/**
 * Flow Observer for Tillu Core
 * Tracks all pipeline/skill/action flow steps, ensures responses are honest,
 * emits flow-complete events, provides accurate status updates
 */

import type { TilluOutput, ActionStep } from "../types";
import { emitToUI } from "./presence";

// Observer events
type FlowEvent =
  | { type: "pipeline_started"; userInput: string; timestamp: number }
  | { type: "pipeline_completed"; output: TilluOutput; success: boolean; latency_ms: number; timestamp: number }
  | { type: "skill_started"; skillName: string; timestamp: number }
  | { type: "skill_completed"; skillName: string; success: boolean; latency_ms: number; timestamp: number }
  | { type: "action_step_started"; step: ActionStep; timestamp: number }
  | { type: "action_step_completed"; step: ActionStep; success: boolean; output: unknown; error?: string; timestamp: number }
  | { type: "action_path_completed"; success: boolean; stepsCompleted: number; timestamp: number };

type Listener = (event: FlowEvent) => void;

class FlowObserver {
  private listeners: Listener[] = [];
  private flowHistory: FlowEvent[] = [];

  // Subscribe to flow events
  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      // Unsubscribe
      const index = this.listeners.indexOf(listener);
      if (index !== -1) this.listeners.splice(index, 1);
    };
  }

  // Emit flow event
  private emit(event: FlowEvent): void {
    this.flowHistory.push(event);
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.warn("[FlowObserver] Listener error:", (e as Error).message);
      }
    }
  }

  // Public emit methods
  pipelineStarted(userInput: string): void {
    this.emit({
      type: "pipeline_started",
      userInput,
      timestamp: Date.now()
    });
  }

  pipelineCompleted(output: TilluOutput, success: boolean, latency_ms: number): void {
    this.emit({
      type: "pipeline_completed",
      output,
      success,
      latency_ms,
      timestamp: Date.now()
    });
  }

  skillStarted(skillName: string): void {
    this.emit({
      type: "skill_started",
      skillName,
      timestamp: Date.now()
    });
  }

  skillCompleted(skillName: string, success: boolean, latency_ms: number): void {
    this.emit({
      type: "skill_completed",
      skillName,
      success,
      latency_ms,
      timestamp: Date.now()
    });
  }

  actionStepStarted(step: ActionStep): void {
    this.emit({
      type: "action_step_started",
      step,
      timestamp: Date.now()
    });
  }

  actionStepCompleted(step: ActionStep, success: boolean, output: unknown, error?: string): void {
    this.emit({
      type: "action_step_completed",
      step,
      success,
      output,
      error,
      timestamp: Date.now()
    });
  }

  actionPathCompleted(success: boolean, stepsCompleted: number): void {
    this.emit({
      type: "action_path_completed",
      success,
      stepsCompleted,
      timestamp: Date.now()
    });
  }

  // Get history
  getHistory(): FlowEvent[] {
    return [...this.flowHistory];
  }
}

// Singleton instance
export const flowObserver = new FlowObserver();

// Default listener for honest UI feedback
flowObserver.subscribe((event) => {
  switch (event.type) {
    case "pipeline_started":
      emitToUI({ type: "thought", step: "Processing your request...", icon: "brain" });
      break;

    case "pipeline_completed":
      console.log(`[FlowObserver] Pipeline complete (success=${event.success})`);
      // Ensure we have a response (even short one) if pipeline failed?
      break;

    case "skill_started":
      emitToUI({ type: "thought", step: `Running skill: ${event.skillName}`, icon: "brain" });
      break;

    case "skill_completed":
      console.log(`[FlowObserver] Skill ${event.skillName} complete (success=${event.success})`);
      break;

    case "action_step_started":
      console.log(`[FlowObserver] Step started: ${event.step.action}`);
      break;

    case "action_step_completed":
      console.log(`[FlowObserver] Step complete: ${event.step.action} (success=${event.success})`);
      break;

    case "action_path_completed":
      console.log(`[FlowObserver] Action path complete (success=${event.success}, steps=${event.stepsCompleted})`);
      break;
  }
});
