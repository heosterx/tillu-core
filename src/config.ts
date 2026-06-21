import dotenv from "dotenv";

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || "development";
if (env !== "production") {
  dotenv.config();
}

// ─── Configuration Validation ───────────────────────────────────────────────────

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function number(key: string, fallback: number): number {
  const value = parseInt(process.env[key] || String(fallback), 10);
  if (isNaN(value)) {
    throw new Error(`Invalid number for environment variable: ${key}`);
  }
  return value;
}

function boolean(key: string, fallback: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

// ─── Production Configuration ──────────────────────────────────────────────────

export const config = {
  // Environment detection
  env: env as "development" | "production" | "test",
  isProduction: env === "production",
  isDevelopment: env === "development",
  isTest: env === "test",

  // Server configuration
  server: {
    port: number("PORT", 10000),
    host: optional("HOST", "0.0.0.0"),
    nodeEnv: env,
    
    // Production-specific settings
    corsOrigin: optional("CORS_ORIGIN", env === "production" ? "https://tillu-ui.vercel.app" : "*"),
    trustProxy: boolean("TRUST_PROXY", env === "production"),
    
    // Rate limiting
    rateLimitWindowMs: number("RATE_LIMIT_WINDOW_MS", 900000), // 15 minutes
    rateLimitMaxRequests: number("RATE_LIMIT_MAX_REQUESTS", 100),
    
    // Request size limits
    maxPayloadSize: number("MAX_PAYLOAD_SIZE", 10485760), // 10MB
  },

  // Logging configuration
  logging: {
    level: optional("LOG_LEVEL", env === "production" ? "info" : "debug"),
    format: optional("LOG_FORMAT", env === "production" ? "json" : "pretty"),
    enableStackTrace: boolean("ENABLE_STACK_TRACE", env !== "production"),
  },

  // LLM Provider Configuration
  llm: {
    // Cerebras — primary classifier
    cerebrasKey:      optional("CEREBRAS_API_KEY", ""),
    cerebrasModel:    optional("CEREBRAS_MODEL", "gpt-oss-120b"),
    cerebrasTimeout: number("CEREBRAS_TIMEOUT", 10000), // 10s

    // Groq — primary planner
    groqKey:          optional("GROQ_API_KEY", ""),
    groqModel:        optional("GROQ_MODEL", "openai/gpt-oss-20b"),
    groqTimeout:      number("GROQ_TIMEOUT", 15000), // 15s

    // Google Gemini — writer
    googleKey:        optional("GOOGLE_AI_API_KEY", ""),
    googleModel:      optional("GOOGLE_MODEL", "gemini-2.5-flash-lite"),
    googleTimeout:    number("GOOGLE_TIMEOUT", 20000), // 20s

    // OpenRouter — fallback
    openrouterKey:    optional("OPENROUTER_API_KEY", ""),
    openrouterModel:  optional("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free"),
    openrouterTimeout: number("OPENROUTER_TIMEOUT", 20000), // 20s

    // Together AI — free tier fallback
    togetherKey:      optional("TOGETHER_AI_API_KEY", ""),
    togetherModel:    optional("TOGETHER_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"),
    togetherTimeout:  number("TOGETHER_TIMEOUT", 20000), // 20s

    // HuggingFace — last resort
    hfKey:            optional("HF_API_KEY", ""),
    hfModel:          optional("HF_MODEL", "meta-llama/Llama-3.3-70B-Instruct"),
    hfTimeout:        number("HF_TIMEOUT", 30000), // 30s

    // Jina AI — embeddings
    jinaKey:          optional("JINA_API_KEY", ""),
    
    // Provider fallback configuration
    enableFallback:   boolean("LLM_ENABLE_FALLBACK", true),
    fallbackRetryAttempts: number("LLM_FALLBACK_RETRY_ATTEMPTS", 3),
    providerCooldownMs: number("LLM_PROVIDER_COOLDOWN_MS", 60000), // 1 minute
  },

  // Voice service configuration
  voice: {
    sarvamKey:      optional("SARVAM_API_KEY", ""),
    cartesiaKey:    optional("CARTESIA_API_KEY", ""),
    elevenlabsKey:  optional("ELEVENLABS_API_KEY", ""),
    defaultVoice:   optional("DEFAULT_VOICE", "en-US"),
    enableFallback: boolean("VOICE_ENABLE_FALLBACK", true),
  },

  // External service URLs
  services: {
    memoryUrl:       required("TILLU_MEMORY_URL"),
    searchUrl:       required("TILLU_SEARCH_URL"),
    voiceUrl:        required("TILLU_VOICE_URL"),
    seeUrl:          required("TILLU_SEE_URL"),
    newsWeatherUrl:  required("TILLU_NEWS_WEATHER_URL"),
    
    // Service timeouts
    serviceTimeout:  number("SERVICE_TIMEOUT", 30000), // 30s
    serviceRetries:  number("SERVICE_RETRIES", 3),
  },

  // User profile
  heoster: {
    userId:   optional("TILLU_USER_ID", "heoster"),
    name:     optional("TILLU_USER_NAME", "Harsh"),
    nickname: optional("TILLU_NICKNAME", "Heoster"),
    timezone: optional("TILLU_TIMEZONE", "Asia/Kolkata"),
    language: optional("TILLU_LANGUAGE", "hi-en"),
    location: optional("TILLU_LOCATION", "Rampur Khatauli, Muzaffarnagar, UP, India"),
    school:   optional("TILLU_SCHOOL", "Maples Academy, Khatauli"),
    class:    optional("TILLU_CLASS", "12"),
  },

  // Dream Loop configuration
  dreamLoop: {
    enabled:              boolean("DREAM_LOOP_ENABLED", true),
    intervalHours:        number("DREAM_LOOP_INTERVAL_HOURS", 1),
    morningBriefingTime:  optional("MORNING_BRIEFING_TIME", "05:30"),
    consolidationTime:    optional("CONSOLIDATION_TIME", "23:00"),
    
    // Feature flags
    enableMemoryConsolidation: boolean("ENABLE_MEMORY_CONSOLIDATION", true),
    enableMorningBriefing:     boolean("ENABLE_MORNING_BRIEFING", true),
    enableWorldMonitor:        boolean("ENABLE_WORLD_MONITOR", true),
    enableCalendarCheck:       boolean("ENABLE_CALENDAR_CHECK", true),
    enableSelfReview:          boolean("ENABLE_SELF_REVIEW", true),
  },

  // WebSocket configuration
  websocket: {
    heartbeatInterval: number("WS_HEARTBEAT_INTERVAL", 30000), // 30s
    clientTimeout:    number("WS_CLIENT_TIMEOUT", 60000), // 60s
    maxConnections:   number("WS_MAX_CONNECTIONS", 100),
    enableCompression: boolean("WS_ENABLE_COMPRESSION", true),
  },

  // Security configuration
  security: {
    enableRateLimit:      boolean("ENABLE_RATE_LIMIT", true),
    enableCors:           boolean("ENABLE_CORS", true),
    enableHelmet:         boolean("ENABLE_HELMET", env === "production"),
    enableRequestLogging: boolean("ENABLE_REQUEST_LOGGING", env !== "production"),
    apiKey:               optional("API_KEY", ""), // Optional API key for protected endpoints
  },

  // Monitoring and observability
  monitoring: {
    enableMetrics:     boolean("ENABLE_METRICS", env === "production"),
    enableHealthCheck: boolean("ENABLE_HEALTH_CHECK", true),
    metricsPath:       optional("METRICS_PATH", "/metrics"),
    healthCheckPath:   optional("HEALTH_CHECK_PATH", "/health"),
  },

  // Feature flags
  features: {
    enableSkills:       boolean("ENABLE_SKILLS", true),
    enableSelfEvolution: boolean("ENABLE_SELF_EVOLUTION", true),
    enableCalendar:     boolean("ENABLE_CALENDAR", true),
    enableRelationshipTracking: boolean("ENABLE_RELATIONSHIP_TRACKING", true),
  },
} as const;

// ─── Configuration Validation ───────────────────────────────────────────────────

// Validate critical configuration in production
if (env === "production") {
  const requiredKeys = [
    "TILLU_MEMORY_URL",
    "TILLU_SEARCH_URL", 
    "TILLU_VOICE_URL",
    "TILLU_SEE_URL",
    "TILLU_NEWS_WEATHER_URL",
  ];

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      throw new Error(`Production deployment missing required environment variable: ${key}`);
    }
  }

  // Warn about missing optional but recommended keys
  const recommendedKeys = [
    "CEREBRAS_API_KEY",
    "GROQ_API_KEY",
    "GOOGLE_AI_API_KEY",
    "SARVAM_API_KEY",
  ];

  for (const key of recommendedKeys) {
    if (!process.env[key]) {
      console.warn(`[Config] Recommended environment variable not set: ${key}`);
    }
  }
}

// Log configuration on startup (without sensitive values)
console.log(`[Config] Environment: ${env}`);
console.log(`[Config] Server: ${config.server.host}:${config.server.port}`);
console.log(`[Config] LLM Providers: ${Object.keys(config.llm).filter(k => k.includes('Key') && config.llm[k as keyof typeof config.llm]).length} configured`);
console.log(`[Config] Dream Loop: ${config.dreamLoop.enabled ? "enabled" : "disabled"}`);
