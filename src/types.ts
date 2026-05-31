// ─── Heoster Profile ─────────────────────────────────────────────────────────

export const HEOSTER = {
  nickname: "Heoster",
  fullName: "Harsh",
  school: "Maples Academy, Khatauli",
  class: "12",
  location: "Rampur Khatauli, Muzaffarnagar, Uttar Pradesh, India",
  timezone: "Asia/Kolkata",
  language: "hi-en",
  userId: "heoster",
} as const;

// ─── Presence ─────────────────────────────────────────────────────────────────

export type ConnectionType = "sense" | "hands" | "ui";
export type PresenceMode = "online" | "offline";

export interface PresenceState {
  sense_connected: boolean;
  hands_connected: boolean;
  ui_connected: boolean;
  mode: PresenceMode;
  last_seen: string | null;
}

export interface SenseContext {
  status: "online" | "offline";
  user_state: string;
  focus_level: string;
  interruption_ok: boolean;
  active_app: string;
  active_window_title: string;
  active_url: string;
  idle_seconds: number;
  audio_playing: boolean;
  audio_app: string | null;
  clipboard_text: string;
  screen_description: string;
  intent_signals: string[];
  time_ist: string;
}

// ─── Brain / Pipeline ─────────────────────────────────────────────────────────

export type Intent =
  | "question"
  | "search"
  | "system_action"
  | "vision"
  | "code"
  | "calendar"
  | "memory"
  | "conversation"
  | "multi_step";

export type Urgency = "low" | "medium" | "high";

export interface ClassifierOutput {
  intent: Intent;
  has_response: boolean;
  has_action: boolean;
  needs_confirmation: boolean;
  urgency: Urgency;
  short_circuit: boolean;   // true = skip planner, writer answers directly
}

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
  reason?: string;
}

export interface PlannerOutput {
  tool_calls: ToolCall[];
}

// ─── TilluOutput — Response + Action separated ───────────────────────────────

export type ActionStepStatus = "pending" | "running" | "done" | "failed" | "skipped";
export type ActionStatus = "pending" | "running" | "done" | "failed" | "cancelled";

export interface ActionStep {
  id: string;
  tool: "hands" | "browser" | "search" | "see" | "memory" | "calendar" | "voice" | "create_skill" | "news" | "weather" | "rag" | "open_browser";
  action: string;
  params: Record<string, unknown>;
  status: ActionStepStatus;
  output?: unknown;
  error?: string;
}

export interface TilluAction {
  id: string;
  plan: ActionStep[];
  status: ActionStatus;
  requires_confirmation: boolean;
  confirmation_message?: string;
}

export interface TilluResponse {
  text: string;
  lang: string;
  audio_url?: string;
  display_text?: string;
}

export interface TilluOutput {
  response: TilluResponse | null;
  action: TilluAction | null;
}

// ─── WebSocket Messages ───────────────────────────────────────────────────────

// Inbound (from clients)
export type InboundMessage =
  | { type: "presence"; status: "online" | "offline" }
  | { type: "context"; data: SenseContext }
  | { type: "voice"; transcript: string; image?: string }
  | { type: "message"; text: string; image?: string }
  | { type: "confirm"; action_id: string; approved: boolean }
  | { type: "cancel"; action_id: string }
  | { type: "action_result"; id: string; success: boolean; output?: unknown; error?: string }
  | { type: "hands_ready"; capabilities: string[] };

// Outbound (to UI)
export type OutboundUIMessage =
  | { type: "greeting"; text: string; audio_url?: string }
  | { type: "thought"; step: string; icon?: string }
  | { type: "token"; text: string }
  | { type: "response_text"; text: string }
  | { type: "response_audio"; audio_url: string }
  | { type: "response_card"; card_type: string; data: unknown }
  | { type: "action_start"; action_id: string; plan: ActionStep[] }
  | { type: "action_step"; action_id: string; step_id: string; status: ActionStepStatus; output?: unknown; error?: string }
  | { type: "action_done"; action_id: string; success: boolean }
  | { type: "action_confirm"; action_id: string; message: string; pending_step: ActionStep }
  | { type: "proactive"; message: string; recipe?: string }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "mode_change"; mode: PresenceMode }
  | { type: "open_browser" }
  | {
      type: "status_update";
      connections: {
        sense: boolean;
        hands: boolean;
        ui: boolean;
      };
      services: {
        memory: boolean;
        search: boolean;
        voice: boolean;
        see: boolean;
        newsWeather: boolean;
      };
      active_model?: string;
      memory_ctx_size?: number;
    };

// Outbound (to Hands)
export type OutboundHandsMessage =
  | { type: "action"; id: string; action: string; params: Record<string, unknown> }
  | { type: "confirmed"; action_id: string }
  | { type: "pull_queue" };

// ─── Dream Loop ───────────────────────────────────────────────────────────────

export interface DreamLoopState {
  last_consolidated: string | null;
  last_briefing_prepared: string | null;
  last_world_monitor: string | null;
  morning_briefing_delivered_today: boolean;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string;      // HH:MM
  category: "school" | "exam" | "birthday" | "holiday" | "personal";
  notes?: string;
}

// ─── Skills ───────────────────────────────────────────────────────────────────

export interface SkillTrigger {
  voice_commands?: string[];
  context_condition?: {
    when: string;
    cooldown_minutes?: number;
  };
}

export interface SkillStep {
  action: string;
  params?: Record<string, unknown>;
  on_failure?: "skip" | "retry" | "abort";
  save_as?: string;
}

export interface SkillPolicy {
  require_confirmation?: boolean;
  interruption_level?: "low" | "medium" | "high" | "full" | "any" | "minimal";
  autonomy_level?: 0 | 1 | 2 | 3 | 4;
  response_format?: "voice" | "card" | "voice_and_card" | "silent";
}

export interface Skill {
  skill: string;
  description: string;
  version: string;
  created_by?: "heoster" | "tillu";
  trigger: SkillTrigger;
  steps: SkillStep[];
  policy?: SkillPolicy;
  memory_hook?: {
    save_after?: boolean;
    key?: string;
    value?: unknown;
  };
  verify?: {
    check: string;
    timeout_s?: number;
  };
}
