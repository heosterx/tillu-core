# 🧠 Tillu-Core — Service Plan v7.0
# Persistent Brain | Render | 24/7

> The mind of TILLU. Runs on Render 24/7. Knows Heoster deeply. Thinks when he's present, dreams when he's away. Never stops. Never forgets. Gets smarter every day.

---

## Hosting

| Property | Value |
|---|---|
| **Platform** | Render (free tier, Node.js web service) |
| **URL** | `https://tillu-core.onrender.com` |
| **Keep-Alive** | cron-job.org pings `/ping` every 10 min |
| **Runtime** | Node.js 20+ |
| **Cost** | Free |

---

## Who Tillu Serves

```
Nickname:   Heoster  ← always use this in responses
Full name:  Harsh
Class:      12 | Maples Academy, Khatauli
Location:   Rampur Khatauli, Muzaffarnagar, UP, India
Timezone:   Asia/Kolkata (IST, UTC+5:30)
Language:   Hindi/English mix
Role:       Creator of Tillu | Single user
```

This is injected into every LLM system prompt. Tillu always knows who it's talking to.

---

## Online vs Offline Mode

### ONLINE (Sense connected)
- Receives real-time context stream from Sense
- Receives voice/text from UI
- Plans and executes via Hands
- Responds in real time with full awareness
- **Triggers Wake-Up Sequence when all 3 local services connect**

### OFFLINE (Sense disconnected)
- Dream Loop runs every hour
- Prepares for Heoster's return
- Monitors world, consolidates memory
- Self-evolves and reviews performance

---

## Wake-Up Sequence

Triggered when Tillu-UI connects (last of the 3 local services to connect).

```
STEP 1 — Determine greeting
  Check current IST time:
    05:00–11:59 → "Good morning"
    12:00–16:59 → "Good afternoon"
    17:00–20:59 → "Good evening"
    21:00–04:59 → "Good night"

STEP 2 — Pull context
  POST /memory/unified → last session summary
  GET /calendar → today's events + upcoming in 48h
  GET /memory/search → "birthdays in next 3 days"
  GET prepared morning briefing (from Dream Loop)

STEP 3 — Compose greeting (LLM — Quality Model)
  Input: time_of_day + last_session_summary + today_events + birthdays
  Output: personalized spoken greeting

  Example outputs:
  "Good morning Heoster! Yesterday we were working on the Tillu-Core
   architecture. Today you have Physics class at 10 AM. Also, your
   friend Aryan's birthday is in 2 days — want me to remind you?"

  "Good evening Heoster! Looks like a long day. Last time you asked
   me about board exam preparation. Your Chemistry exam is in 12 days."

STEP 4 — Deliver
  POST /api/speak → audio
  Emit to UI: { type: "greeting", text, audio_url }
  UI: plays audio + shows greeting card
```

### Greeting is Never a Template
The LLM generates it fresh every time with full context. It always:
- Uses "Heoster" (never "Harsh" or "user")
- References something from the last session
- Mentions today's relevant events if any
- Feels like a friend who was waiting for you

---

## Internal Engines

### 1. Multi-Model Brain (The Core Innovation)

Instead of one LLM doing everything, multiple models collaborate in a pipeline. Each model does what it's best at.

```
REQUEST PIPELINE:

  INPUT (voice/text + context)
       │
       ▼
  ┌─────────────────────────────────────────────────────┐
  │  STAGE 1: CLASSIFIER (Cerebras llama-3.3-70b)       │
  │  Ultra-fast. Runs in ~200ms.                        │
  │  Output: intent, urgency, needs_tools, needs_vision │
  └──────────────────────┬──────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────┐
  │  STAGE 2: PLANNER (Groq llama-3.3-70b)              │
  │  Fast reasoning. Runs in ~500ms.                    │
  │  Input: intent + context + available tools          │
  │  Output: ordered tool plan (function calls)         │
  └──────────────────────┬──────────────────────────────┘
                         │
                    [execute tools]
                         │
                         ▼
  ┌─────────────────────────────────────────────────────┐
  │  STAGE 3: WRITER (Gemini-2.5-flash-lite)            │
  │  Quality-focused. Runs in ~800ms.                   │
  │  Input: tool results + Heoster profile + context    │
  │  Output: final response — personalized, warm, brief │
  └──────────────────────┬──────────────────────────────┘
                         │
                         ▼
  ┌─────────────────────────────────────────────────────┐
  │  STAGE 4: VOICE (Indic Voice Hub)                   │
  │  Sarvam → Cartesia → ElevenLabs                     │
  │  Output: audio_url                                  │
  └─────────────────────────────────────────────────────┘
```

### Why This Works Better Than One Model

| Stage | Model | Why This Model |
|---|---|---|
| Classify | Cerebras | Fastest inference on earth. Intent classification needs speed, not depth. |
| Plan | Groq | Fast + reliable function calling. Planning needs structured output. |
| Write | Gemini-2.5-flash-lite | Best free model for natural, personalized text. Writing needs quality. |
| Vision | Gemini-2.5-flash-lite | Multimodal. Only called when image/screen involved. |
| Embed | Groq (text-embedding) | Memory search. Needs consistency with stored embeddings. |

### Fallback Per Stage
Each stage has its own fallback — not a global chain:
```
Classifier fallback: Groq → OpenRouter → skip (assume "general" intent)
Planner fallback:    OpenRouter → Gemini → HF
Writer fallback:     Groq → OpenRouter → HF
Vision fallback:     HF LLaVA → Tesseract (OCR only)
```

### Short-Circuit Paths
Not every request needs all 4 stages:
- Simple factual question → Classifier detects `no_tools_needed` → skip Planner → Writer answers directly
- "Open Chrome" → Classifier detects `system_action` → skip Planner → direct Hands call → Writer confirms
- Vision task → Classifier detects `vision` → skip Planner → Vision model → Writer formats

### 2. Presence Manager

Tracks which local services are connected and fires the Wake-Up Sequence.

```
Connection state:
  sense_connected:  false
  hands_connected:  false
  ui_connected:     false
  all_connected:    false  ← triggers Wake-Up Sequence

When all three connect:
  1. all_connected = true
  2. mode = "online"
  3. Fire Wake-Up Sequence (see above)
  4. Deliver prepared morning briefing if available

When any disconnect:
  If sense disconnects → mode = "offline", start Dream Loop
  If hands disconnects → queue actions, notify UI
  If ui disconnects   → continue processing, buffer responses
```

### 3. Dream Loop (hourly, offline)
```
05:30 IST daily   → Morning briefing preparation
23:00 IST daily   → Memory consolidation
Every hour        → World monitoring + calendar check
Weekly Sunday     → Skill performance review
```

Steps each cycle:
1. **Memory Consolidation** — compress sessions → long-term
2. **Morning Prep** — news + weather + calendar → briefing
3. **World Monitor** — search Heoster's tracked topics
4. **Calendar Check** — events, birthdays, exams in 48h
5. **Self-Review** — skill performance analysis
6. **Relationship Tracker** — upcoming birthdays, anniversaries

### 4. Calendar Engine
Built-in calendar stored in Supabase.
```
Events:
  - School schedule (Maples Academy, Class 12)
  - Exam dates and holidays
  - Birthdays of relatives and friends
  - Custom events added by Heoster via voice

Proactive alerts:
  - "Heoster, board exams in 30 days"
  - "Your cousin's birthday is tomorrow"
  - "Physics exam this Friday"
```

### 5. Self-Evolution Engine
After every interaction:
- Score response quality (implicit: did Heoster follow up positively?)
- Track which LLM provider worked best per query type
- Update skill performance scores in Supabase
- Extract new preferences from conversation
- Auto-create skills from "whenever I say X, do Y" commands
- Flag underperforming skills for review

### 6. Skill Engine
- Loads YAML skills from `tillu-skills/` at startup
- Hot-reloads on file change
- Tracks usage + success rate in Supabase
- Heoster can create skills via voice → Core writes YAML
- Skills can chain (call other skills as steps)
- Dry-run mode for testing new skills

---

## WebSocket Protocol

### Connections Core accepts:
- Tillu-Sense: `wss://tillu-core.onrender.com/sense`
- Tillu-Hands: `wss://tillu-core.onrender.com/hands`
- Tillu-UI: `wss://tillu-core.onrender.com/ui`

### Messages Sense → Core:
```json
{ "type": "presence", "status": "online" }
{ "type": "context", "data": { ...presence_model } }
{ "type": "voice", "transcript": "Hey Tillu, what's the news?" }
{ "type": "presence", "status": "offline" }
```

### Messages Core → UI:
```json
{ "type": "thought", "step": "Searching web..." }
{ "type": "token", "text": "partial response..." }
{ "type": "response", "text": "...", "audio_url": "..." }
{ "type": "proactive", "message": "Heoster, board exams in 30 days" }
{ "type": "confirmation", "action": "...", "message": "..." }
```

### Messages Core → Hands:
```json
{ "type": "action", "id": "act_001", "action": "open_app", "params": { "app": "chrome" } }
```

### Messages Hands → Core:
```json
{ "type": "action_result", "id": "act_001", "success": true, "output": {...} }
```

---

## REST API

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/ping` | Keep-alive for cron-job.org |
| `GET` | `/health` | Full system health |
| `POST` | `/message` | Send text message (fallback if WS unavailable) |
| `GET` | `/briefing` | Get prepared morning briefing |
| `GET` | `/calendar` | Get upcoming events |
| `POST` | `/calendar/event` | Add calendar event |
| `GET` | `/skills` | List all skills + performance |
| `POST` | `/skills/create` | Create new skill from description |
| `GET` | `/presence` | Current online/offline state |
| `GET` | `/dream/status` | Dream loop status |

---

## Response vs Action — Fundamental Separation

Every output from Tillu is a `TilluOutput` with two independent parts. They execute in parallel, not sequentially.

### TilluOutput Model

```typescript
interface TilluOutput {
  // RESPONSE — what Tillu says
  // Goes to: Writer → TTS → Voice Hub → audio → UI voice area
  response: {
    text: string;           // spoken text → TTS
    lang: string;           // language for TTS
    audio_url?: string;     // filled after TTS call
    display_text?: string;  // richer text for UI card (optional)
  } | null;

  // ACTION — what Tillu does
  // Goes to: Planner → Hands → desktop → verify → report
  action: {
    id: string;
    plan: ActionStep[];
    status: "pending" | "running" | "done" | "failed" | "cancelled";
    requires_confirmation: boolean;
    confirmation_message?: string;
  } | null;
}

interface ActionStep {
  id: string;
  tool: "hands" | "browser" | "search" | "see" | "memory" | "calendar";
  action: string;           // "open_app", "navigate", "search", etc.
  params: object;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  output?: unknown;
  error?: string;
}
```

### When Each Part Is Present

| Request Type | response | action |
|---|---|---|
| "What is the capital of India?" | ✅ text answer | null |
| "Open Chrome" | ✅ "Opening Chrome" | ✅ open_app step |
| "Search for news and open top 3 sites" | ✅ spoken summary | ✅ browser steps |
| Silent reminder set (background) | null | ✅ reminder step |
| "What's on my screen?" | ✅ description | ✅ screenshot step |

### Parallel Execution

Response and Action execute in parallel — not one after the other:

```
INPUT
  │
  ├── RESPONSE PATH (parallel)
  │     Writer (Gemini) generates text
  │     → POST /api/speak → audio_url
  │     → emit { type: "response" } to UI
  │     → UI plays audio immediately
  │     → does NOT wait for action to finish
  │
  └── ACTION PATH (parallel)
        Planner (Groq) generates action plan
        → emit { type: "action_start", plan } to UI
        → UI shows action flow panel
        → For each step:
            emit { type: "action_step", id, status: "running" }
            Hands executes
            Core verifies
            emit { type: "action_step", id, status: "done"|"failed" }
        → emit { type: "action_done" }
```

Tillu speaks "Opening Chrome for you" at the same moment Chrome starts opening. Not after.

---

## Execution Pipeline (Updated)

```
INPUT (voice/text + context)
    │
    ▼
STAGE 1 — CLASSIFIER (Cerebras, ~200ms)
  Output: {
    intent: string,
    has_response: boolean,
    has_action: boolean,
    needs_confirmation: boolean,
    urgency: "low"|"medium"|"high"
  }
    │
    ├─────────────────────────────────────────┐
    │                                         │
    ▼                                         ▼
RESPONSE PATH                           ACTION PATH
(if has_response)                       (if has_action)
    │                                         │
STAGE 3 — WRITER                       STAGE 2 — PLANNER
(Gemini, ~800ms)                        (Groq, ~500ms)
    │                                         │
    ▼                                         ▼
POST /api/speak                         emit action_start to UI
→ audio_url                                   │
    │                                   For each step:
emit "response" to UI                     emit step_running
UI plays audio                            → Hands executes
                                          → Core verifies
                                          emit step_done/failed
                                          │
                                    emit action_done to UI
```

---

## WebSocket Events (Separated)

### Response Events (Core → UI)
```json
{ "type": "response_text", "text": "Opening Chrome for you, Heoster." }
{ "type": "response_audio", "audio_url": "https://tillu-voice.vercel.app/..." }
{ "type": "response_card", "card_type": "search", "data": {...} }
```

### Action Events (Core → UI)
```json
{ "type": "action_start", "action_id": "act_001",
  "plan": [
    { "id": "step_1", "tool": "hands", "action": "open_app", "params": { "app": "chrome" }, "status": "pending" },
    { "id": "step_2", "tool": "browser", "action": "navigate", "params": { "url": "gmail.com" }, "status": "pending" }
  ]
}
{ "type": "action_step", "action_id": "act_001", "step_id": "step_1", "status": "running" }
{ "type": "action_step", "action_id": "act_001", "step_id": "step_1", "status": "done", "output": { "pid": 1234 } }
{ "type": "action_step", "action_id": "act_001", "step_id": "step_2", "status": "running" }
{ "type": "action_done", "action_id": "act_001", "success": true }

{ "type": "action_confirm", "action_id": "act_001",
  "message": "About to run: 'del file.txt'. Confirm?",
  "pending_step": { "id": "step_1", ... }
}
```

### UI → Core
```json
{ "type": "confirm", "action_id": "act_001", "approved": true }
{ "type": "cancel", "action_id": "act_001" }
```

---

---

## Tool Schema (Function Calling)

```json
[
  { "name": "search", "description": "Search web for real-time info",
    "parameters": { "query": "string", "mode": "fast|full", "category": "general|videos|news" } },
  { "name": "memory_read", "description": "Read Heoster's memories and preferences",
    "parameters": { "query": "string" } },
  { "name": "memory_write", "description": "Save a fact about Heoster",
    "parameters": { "content": "string", "type": "fact|preference|event|birthday" } },
  { "name": "hands", "description": "Control Heoster's Windows desktop",
    "parameters": { "action": "string", "params": "object" } },
  { "name": "see", "description": "Analyze image or screenshot",
    "parameters": { "task": "screen_read|ocr|describe|visual_qa", "question": "string" } },
  { "name": "speak", "description": "Convert text to speech",
    "parameters": { "text": "string", "lang": "string" } },
  { "name": "calendar", "description": "Read or write calendar events",
    "parameters": { "action": "read|add|delete", "event": "object" } },
  { "name": "create_skill", "description": "Create a new skill from Heoster's instruction",
    "parameters": { "name": "string", "trigger": "string", "steps": "array" } }
]
```

---

## System Prompts (Per Stage)

### Classifier Prompt (Cerebras — ultra short, fast)
```
You are an intent classifier for TILLU, Heoster's AI assistant.
Classify this input into one of:
  question, search, system_action, vision, code, calendar, memory, conversation, multi_step
Also output: needs_tools (bool), urgency (low/medium/high), short_circuit (bool).
Return JSON only. No explanation.
Input: {user_input}
Context: {one_line_context}
```

### Planner Prompt (Groq — structured)
```
You are the planning engine for TILLU, Heoster's AI assistant.
Heoster is a Class 12 student in Muzaffarnagar, India (IST timezone).
Intent: {classified_intent}
Available tools: {tool_schema}
Context: {context_summary}
Produce an ordered list of tool calls to fulfill this request.
Return JSON array of tool calls only. No explanation.
```

### Writer Prompt (Gemini-2.5-flash-lite — quality, personal)
```
You are TILLU, a personal AI assistant created by Heoster.
Always address him as "Heoster" — never "Harsh" or "user".
He is a Class 12 student at Maples Academy, Khatauli, Muzaffarnagar, India.
Current time: {time_IST} | Mode: {online/offline}

Tool results: {tool_results}
Original request: {user_input}

Write a response that is:
- Warm and personal, like a trusted friend
- Concise — it will be spoken aloud
- In Hindi/English mix if appropriate
- References Heoster by name naturally
- Never sounds like a chatbot
```

### Wake-Up Writer Prompt (Gemini — special greeting)
```
You are TILLU greeting Heoster as he comes online.
Time: {time_IST}
  05:00–11:59 → "Good morning Heoster!"
  12:00–16:59 → "Good afternoon Heoster!"
  17:00–20:59 → "Good evening Heoster!"
  21:00–04:59 → "Good night Heoster!"

Last session summary: {summary}
Today's events: {events}
Upcoming birthdays (next 3 days): {birthdays}
Prepared briefing: {briefing}

Write a warm, personal greeting (2-3 sentences, spoken aloud).
- Mention something specific from the last session
- Mention today's most important event if any
- If a birthday is coming up, mention it
- Sound like a friend who was waiting for him, not a system booting up
- Never say "How can I help you today?" — that's chatbot language
```

## Heoster Profile (always in system prompt)

```
You are TILLU, a personal AI assistant created by Heoster.
You serve only one person: Heoster (real name: Harsh).
Always address him as "Heoster" — never "Harsh" or "user".

About Heoster:
- Class 12 student at Maples Academy, Khatauli
- Lives in Rampur Khatauli, Muzaffarnagar, Uttar Pradesh, India
- Timezone: Asia/Kolkata (IST, UTC+5:30)
- Prefers Hindi/English mix in responses
- He created you — treat him as your creator and friend

Current time: {current_time_IST}
Current mode: {online|offline}
Current context: {context_summary}

You are not a chatbot. You are an always-running digital mind.
When Heoster is away, you prepare. When he's present, you act.
Keep responses concise — they will be spoken aloud.
For sensitive actions, ask for confirmation first.
```

---

## Render Deployment

```
Service type:  Web Service
Runtime:       Node.js
Build command: npm run build
Start command: node dist/index.js
Port:          10000
Plan:          Free

Environment variables: all from .env

Keep-alive:
  cron-job.org → GET https://tillu-core.onrender.com/ping
  Every 10 minutes → prevents Render sleep
```

---

## Technology Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| WebSocket | `ws` library |
| HTTP Server | Express |
| Scheduler | `node-cron` |
| Classifier | Cerebras `llama-3.3-70b` |
| Planner | Groq `llama-3.3-70b-versatile` |
| Writer | Google `gemini-2.5-flash-lite` |
| Vision | Google `gemini-2.5-flash-lite` (multimodal) |
| Fallbacks | OpenRouter → HuggingFace (per stage) |
| Skill Engine | YAML parser (`js-yaml`) + Supabase performance DB |
| Calendar | Supabase Postgres |
| Keep-alive | cron-job.org (external, free) |

---

## Files (To Build)

```
tillu-core/
├── src/
│   ├── index.ts                  ← Express + WebSocket server
│   ├── engines/
│   │   ├── presence.ts           ← Connection tracker + Wake-Up Sequence
│   │   ├── dream-loop.ts         ← Hourly offline processing
│   │   ├── calendar.ts           ← Built-in calendar engine
│   │   ├── self-evolution.ts     ← Learning + skill adaptation
│   │   └── skill-engine.ts       ← YAML skill loader + executor
│   ├── brain/
│   │   ├── pipeline.ts           ← 4-stage pipeline orchestrator
│   │   ├── classifier.ts         ← Stage 1: Cerebras intent classifier
│   │   ├── planner.ts            ← Stage 2: Groq tool planner
│   │   ├── writer.ts             ← Stage 3: Gemini response writer
│   │   ├── wake-up.ts            ← Special greeting generator
│   │   ├── providers/
│   │   │   ├── cerebras.ts       ← Classifier provider
│   │   │   ├── groq.ts           ← Planner provider
│   │   │   ├── google.ts         ← Writer + Vision provider
│   │   │   ├── openrouter.ts     ← Fallback provider
│   │   │   └── huggingface.ts    ← Last resort provider
│   │   ├── context.ts            ← Context assembly + token budget
│   │   ├── prompts.ts            ← All system prompts (per stage)
│   │   └── tools.schema.ts       ← Tool definitions
│   ├── loops/
│   │   ├── passive-loop.ts       ← 5s context check
│   │   ├── triggered-loop.ts     ← On voice/text/trigger
│   │   └── agentic-loop.ts       ← Multi-step execution
│   ├── tools/
│   │   ├── search.tool.ts
│   │   ├── memory.tool.ts
│   │   ├── see.tool.ts
│   │   ├── hands.tool.ts         ← Sends to Hands via WS
│   │   ├── voice.tool.ts
│   │   └── calendar.tool.ts
│   ├── routes/
│   │   ├── ping.ts               ← Keep-alive for cron-job.org
│   │   ├── health.ts
│   │   ├── message.ts
│   │   ├── briefing.ts
│   │   ├── calendar.ts
│   │   ├── skills.ts
│   │   └── presence.ts
│   └── ws/
│       ├── sense-handler.ts      ← Handles Sense connection
│       ├── hands-handler.ts      ← Handles Hands connection
│       └── ui-handler.ts         ← Handles UI connection
├── package.json
├── tsconfig.json
└── render.yaml                   ← Render deployment config
```
│   │   ├── fallback.ts
│   │   ├── context.ts
│   │   ├── tools.schema.ts
│   │   └── prompt.ts             ← Heoster profile + system prompt
│   ├── loops/
│   │   ├── passive-loop.ts       ← 5s context check
│   │   ├── triggered-loop.ts     ← On voice/text/trigger
│   │   └── agentic-loop.ts       ← Multi-step execution
│   ├── tools/
│   │   ├── search.tool.ts
│   │   ├── memory.tool.ts
│   │   ├── see.tool.ts
│   │   ├── hands.tool.ts         ← Sends to Hands via WS
│   │   ├── voice.tool.ts
│   │   └── calendar.tool.ts
│   ├── routes/
│   │   ├── ping.ts               ← Keep-alive endpoint
│   │   ├── health.ts
│   │   ├── message.ts
│   │   ├── briefing.ts
│   │   ├── calendar.ts
│   │   ├── skills.ts
│   │   └── presence.ts
│   └── ws/
│       ├── sense-handler.ts      ← Handles Sense connection
│       ├── hands-handler.ts      ← Handles Hands connection
│       └── ui-handler.ts         ← Handles UI connection
├── package.json
├── tsconfig.json
└── render.yaml                   ← Render deployment config
```
