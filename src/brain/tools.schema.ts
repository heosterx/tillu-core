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
      description: "Control Heoster's Windows desktop. Available actions:\n- Apps: open_app, close_app, focus_window, minimize_window, maximize_window, check_and_open_chrome, check_and_open_tillu_browser, find_exe_file, run_exe_file, list_windows\n- Mouse: mouse_move, mouse_click, mouse_scroll, mouse_drag\n- Keyboard: keyboard_type, keyboard_hotkey, keyboard_press\n- Screen: take_screenshot, find_on_screen, get_screen_size, get_mouse_position\n- Files: read_file, write_file, list_directory, delete_file, open_file\n- Shell: run_powershell, run_python\n- Browser: browse_navigate, browse_extract, browse_search, browse_screenshot, browse_fill_form, browse_click, browse_close\n- Audio: set_volume, get_volume, mute, media_play_pause, media_next, media_prev\n- Notifications: send_notification, set_reminder, heartbeat_notify\n- Clipboard: get_clipboard, set_clipboard",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", description: "The exact action name to perform from the available actions list." },
          params: { 
            type: "object", 
            description: "Action-specific parameters. MUST match the required arguments for the chosen action.",
            properties: {
              app: { type: "string", description: "App name (for open_app, close_app)" },
              args: { type: "array", items: { type: "string" }, description: "App arguments (for open_app)" },
              title: { type: "string", description: "Window title (for focus_window, minimize_window, maximize_window)" },
              filename: { type: "string", description: "Executable name (for find_exe_file)" },
              absolute_path: { type: "string", description: "Full exe path (for run_exe_file)" },
              x: { type: "number", description: "X coordinate (for mouse_move, mouse_click, mouse_scroll)" },
              y: { type: "number", description: "Y coordinate (for mouse_move, mouse_click, mouse_scroll)" },
              button: { type: "string", enum: ["left", "right", "middle"], description: "Mouse button (for mouse_click)" },
              clicks: { type: "number", description: "Number of clicks (for mouse_click)" },
              amount: { type: "number", description: "Scroll amount (for mouse_scroll)" },
              start_x: { type: "number", description: "Drag start X (for mouse_drag)" },
              start_y: { type: "number", description: "Drag start Y (for mouse_drag)" },
              end_x: { type: "number", description: "Drag end X (for mouse_drag)" },
              end_y: { type: "number", description: "Drag end Y (for mouse_drag)" },
              text: { type: "string", description: "Text to type (for keyboard_type, set_clipboard)" },
              interval: { type: "number", description: "Typing interval (for keyboard_type)" },
              keys: { type: "array", items: { type: "string" }, description: "Keys to press together (for keyboard_hotkey)" },
              key: { type: "string", description: "Single key (for keyboard_press)" },
              region: { type: "array", items: { type: "number" }, description: "Screenshot region [left, top, width, height] (for take_screenshot)" },
              image_path: { type: "string", description: "Path to image (for find_on_screen)" },
              path: { type: "string", description: "File path (for read_file, write_file, list_directory, delete_file, open_file)" },
              content: { type: "string", description: "File content (for write_file)" },
              command: { type: "string", description: "PowerShell command (for run_powershell)" },
              code: { type: "string", description: "Python code (for run_python)" },
              timeout: { type: "number", description: "Timeout in seconds (for run_powershell, run_python, send_notification)" },
              url: { type: "string", description: "URL (for browse_navigate)" },
              selector: { type: "string", description: "CSS Selector (for browse_extract, browse_fill_form, browse_click)" },
              attribute: { type: "string", description: "HTML Attribute (for browse_extract)" },
              query: { type: "string", description: "Search query (for browse_search)" },
              engine: { type: "string", description: "Search engine (for browse_search)" },
              value: { type: "string", description: "Input value (for browse_fill_form)" },
              level: { type: "number", description: "Volume level 0-100 (for set_volume)" },
              muted: { type: "boolean", description: "Mute state (for mute)" },
              message: { type: "string", description: "Notification message (for send_notification, set_reminder, heartbeat_notify)" },
              at_iso: { type: "string", description: "ISO datetime (for set_reminder)" }
            }
          },
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
      name: "rag",
      description: "Retrieve relevant context from Heoster's knowledge base and memory using semantic search. Use for: questions about past conversations, document Q&A, finding relevant context",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to retrieve context about" },
          sessionId: { type: "string", description: "Current session ID" },
        },
        required: ["query"],
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
