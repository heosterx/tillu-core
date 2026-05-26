import dotenv from "dotenv";
if (process.env.NODE_ENV !== "production") dotenv.config();

function req(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}
function opt(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  server: {
    port: parseInt(opt("PORT", "10000"), 10),
    env: opt("NODE_ENV", "development"),
  },
  llm: {
    cerebrasKey:    opt("CEREBRAS_API_KEY", ""),
    groqKey:        opt("GROQ_API_KEY", ""),
    googleKey:      opt("GOOGLE_AI_API_KEY", ""),
    openrouterKey:  opt("OPENROUTER_API_KEY", ""),
    hfKey:          opt("HF_API_KEY", ""),
    togetherKey:    opt("TOGETHER_AI_API_KEY", ""),
  },
  voice: {
    sarvamKey:      opt("SARVAM_API_KEY", ""),
    cartesiaKey:    opt("CARTESIA_API_KEY", ""),
    elevenlabsKey:  opt("ELEVENLABS_API_KEY", ""),
  },
  services: {
    memoryUrl:  opt("TILLU_MEMORY_URL",  "https://tillu-memory.vercel.app"),
    searchUrl:  opt("TILLU_SEARCH_URL",  "https://tillu-search.vercel.app"),
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
