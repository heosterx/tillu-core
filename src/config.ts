import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") dotenv.config();

function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  server: {
    port: parseInt(opt("PORT", "10000"), 10),
    env: opt("NODE_ENV", "development"),
  },
  llm: {
    // Cerebras — free model: GLM-4-9B (via OSSZ.ai on Cerebras)
    cerebrasKey:      opt("CEREBRAS_API_KEY", ""),
    cerebrasModel:    opt("CEREBRAS_MODEL", "GLM-4-9B"),

    // Groq — primary planner + classifier fallback
    groqKey:          opt("GROQ_API_KEY", ""),
    groqModel:        opt("GROQ_MODEL", "llama-3.3-70b-versatile"),

    // Google Gemini — writer (replace key if suspended)
    googleKey:        opt("GOOGLE_AI_API_KEY", ""),
    googleModel:      opt("GOOGLE_MODEL", "gemini-2.5-flash-lite"),

    // OpenRouter — free tier fallback
    openrouterKey:    opt("OPENROUTER_API_KEY", ""),
    openrouterModel:  opt("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),

    // Together AI — free tier (Llama-3.3-70B-Turbo-Free, DeepSeek-R1-Free, Qwen2.5-Free)
    togetherKey:      opt("TOGETHER_AI_API_KEY", ""),
    togetherModel:    opt("TOGETHER_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"),

    // HuggingFace — last resort
    hfKey:            opt("HF_API_KEY", ""),
    hfModel:          opt("HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),
  },
  voice: {
    sarvamKey:      opt("SARVAM_API_KEY", ""),
    cartesiaKey:    opt("CARTESIA_API_KEY", ""),
    elevenlabsKey:  opt("ELEVENLABS_API_KEY", ""),
  },
  services: {
    memoryUrl:  opt("TILLU_MEMORY_URL",  "https://tillu-memory.vercel.app"),
    searchUrl:  opt("TILLU_SEARCH_URL",  "https://tillu-smart-search.vercel.app"),
    voiceUrl:   opt("TILLU_VOICE_URL",   "https://tillu-voice.vercel.app"),
    seeUrl:     opt("TILLU_SEE_URL",     "https://tillu-see.vercel.app"),
  },
  heoster: {
    userId:   "heoster",
    nickname: "Heoster",
    timezone: "Asia/Kolkata",
    language: "hi-en",
  },
} as const;
