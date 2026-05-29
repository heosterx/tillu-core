import type Groq from "groq-sdk";

// ─── Tool definitions for Groq function calling ───────────────────────────────

export const TOOL_SCHEMA: Groq.Chat.CompletionCreateParams.Tool[] = [
  {
    type: "function",
    function: {
      name: "news",
      description: "Get latest news headlines on any topic. Use for: 'what's in the news', 'latest cricket news', 'India news today', 'tech news'",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "News topic or keyword, e.g. 'India cricket', 'AI technology', 'board exams 2026'" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "weather",
      description: "Get current weather for any city. Heoster's default city is Muzaffarnagar. Use for: 'weather today', 'mausam', 'temperature', 'will it rain'",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "City name, e.g. 'Muzaffarnagar', 'Delhi', 'Mumbai'. Defaults to Muzaffarnagar if not specified." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search the web for real-time information: news, prices, weather, facts, videos",
      parameters: {
        type: "object",
        properties: {
          query:    { type: "string", description: "Search query" },
          mode:     { type: "string", enum: ["fast", "full", "search"], description: "fast=AI synthesis, full=deep scrape+AI, search=raw results" },
          category: { type: "string", enum: ["general", "videos", "news", "images"], description: "Search category" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_read",
      description: "Read Heoster's past memories, preferences, and context",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to search for in memory" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory_write",
      description: "Save a new fact, preference, event, or birthday about Heoster",
      parameters: {
        type: "object",
        properties: {
          content:    { type: "string", description: "What to remember" },
          type:       { type: "string", enum: ["fact", "preference", "event", "birthday", "tracked_topic"], description: "Type of memory" },
          importance: { type: "string", enum: ["critical", "high", "normal", "low"], description: "How important is this" },
        },
        required: ["content", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "hands",
      description: "Control Heoster's Windows desktop: open apps, click, type, run commands, take screenshots",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "Action to perform: open_app, mouse_click, keyboard_type, take_screenshot, run_command, browse_navigate, browse_search, set_volume, send_notification, set_reminder" },
          params: { type: "object", description: "Action-specific parameters" },
        },
        required: ["action", "params"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "see",
      description: "Analyze an image or screenshot from Heoster's screen",
      parameters: {
        type: "object",
        properties: {
          task:     { type: "string", enum: ["screen_read", "ocr", "describe", "chart_read", "document_extract", "visual_qa"], description: "Vision task" },
          question: { type: "string", description: "Specific question for visual_qa task" },
        },
        required: ["task"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "speak",
      description: "Convert text to speech and play it for Heoster",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to speak" },
          lang: { type: "string", description: "Language code: hi, en, hi-en (default: hi-en)" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calendar",
      description: "Read or write Heoster's calendar events, exams, and reminders",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["read", "add", "delete"], description: "Calendar action" },
          filter: { type: "string", description: "For read: 'today', 'week', 'exams', 'birthdays'" },
          event:  { type: "object", description: "For add: { title, date, time, notes }" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_skill",
      description: "Create a new custom skill from Heoster's voice instruction. Use when Heoster says 'whenever I say X, do Y'",
      parameters: {
        type: "object",
        properties: {
          name:        { type: "string", description: "Skill name (snake_case)" },
          description: { type: "string", description: "What this skill does" },
          trigger:     { type: "string", description: "Voice command that activates it" },
          steps:       { type: "array",  description: "Array of action steps", items: { type: "object" } },
        },
        required: ["name", "trigger", "steps"],
      },
    },
  },
];

// Plain text schema for Planner prompt (non-function-calling fallback)
export const TOOL_SCHEMA_TEXT = TOOL_SCHEMA.map((t) => {
  const fn = t.function;
  if (!fn) return "";
  const props = (fn.parameters as { properties?: Record<string, { type: string; description: string }> }).properties ?? {};
  const params = Object.entries(props)
    .map(([k, v]) => `  ${k}: ${v.description}`)
    .join("\n");
  return `${fn.name}: ${fn.description}\n${params}`;
}).filter(Boolean).join("\n\n");
