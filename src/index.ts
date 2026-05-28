import path from "path";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import { config } from "./config";
import { startDreamLoop } from "./engines/dream-loop";
import { loadSkills } from "./engines/skill-engine";
import { handleSenseConnection } from "./ws/sense-handler";
import { handleHandsConnection } from "./ws/hands-handler";
import { handleUIConnection } from "./ws/ui-handler";
import { pingHandler } from "./routes/ping";
import { healthHandler } from "./routes/health";
import { messageHandler } from "./routes/message";
import { presenceHandler } from "./routes/presence";
import { briefingHandler } from "./routes/briefing";
import { dreamStatusHandler } from "./routes/dream";
import { skillsListHandler, skillsRunHandler, skillsCreateHandler } from "./routes/skills";

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "10mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  next();
});

// ─── REST routes ──────────────────────────────────────────────────────────────

app.get("/ping",          pingHandler);
app.get("/health",        healthHandler);
app.get("/presence",      presenceHandler);
app.get("/briefing",      briefingHandler);
app.get("/dream/status",  dreamStatusHandler);
app.post("/message",      messageHandler);
app.get("/skills",        skillsListHandler);
app.post("/skills/run",   skillsRunHandler);
app.post("/skills/create", skillsCreateHandler);

// Root
app.get("/", (req, res) => {
  res.json({
    service: "tillu-core",
    version: "1.0.0",
    description: "The persistent brain of TILLU AI",
    endpoints: ["/ping", "/health", "/presence", "/briefing", "/dream/status", "/message", "/skills", "/skills/run", "/skills/create"],
    websockets: ["/sense", "/hands", "/ui"],
  });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws: WebSocket, req) => {
  const path = req.url ?? "/";

  if (path.startsWith("/sense")) {
    handleSenseConnection(ws);
  } else if (path.startsWith("/hands")) {
    handleHandsConnection(ws);
  } else if (path.startsWith("/ui")) {
    handleUIConnection(ws);
  } else {
    console.warn(`[WS] Unknown path: ${path} — closing`);
    ws.close(1008, "Unknown WebSocket path");
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = config.server.port;

server.listen(PORT, () => {
  console.log(`\n🧠 Tillu-Core running on port ${PORT}`);
  console.log(`   REST:      http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/sense | /hands | /ui`);
  console.log(`   Mode:      ${config.server.env}\n`);

  // Load skills from tillu-skills/ directory (sibling of tillu-core/)
  const skillsDir = path.resolve(__dirname, "../../tillu-skills");
  loadSkills(skillsDir);
  console.log(`📚 Skills loaded from ${skillsDir}`);

  // Start Dream Loop scheduler
  startDreamLoop();
  console.log("💤 Dream Loop started — Tillu is always thinking\n");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Core] SIGTERM received — shutting down gracefully");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  console.error("[Core] Uncaught exception:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Core] Unhandled rejection:", reason);
});
