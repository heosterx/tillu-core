// ─── Conversation RAG — conversation continuity pipeline ─────────────────────

import axios from "axios";
import { config } from "../../config";
import { retrieve } from "../retriever";
import type { RetrievedChunk } from "../retriever";
import type { RagResult } from "./memory-rag";

const USER_ID = config.heoster.userId;

/** Retrieve relevant past conversations */
export async function conversationRag(
  currentMessage: string,
  sessionId: string
): Promise<RagResult> {
  const start = Date.now();

  try {
    // Retrieve past conversations and events
    const [summaryChunks, eventChunks] = await Promise.all([
      retrieve(currentMessage, { topK: 4, minScore: 0.2, type: "summary", rerank: true }),
      retrieve(currentMessage, { topK: 3, minScore: 0.2, type: "event", rerank: false }),
    ]);

    // Deduplicate
    const seen = new Set<string>();
    const chunks: RetrievedChunk[] = [];
    for (const c of [...summaryChunks, ...eventChunks]) {
      const key = c.id || c.content.slice(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        chunks.push(c);
      }
    }

    const sorted = chunks.sort((a, b) => b.score - a.score).slice(0, 6);

    if (sorted.length === 0) {
      return { context: "", sources: [], pipeline: "conversation-rag", chunks: [], latency_ms: Date.now() - start };
    }

    const lines = sorted.map(c => {
      const date = c.created_at ? new Date(c.created_at).toLocaleDateString("en-IN") : "";
      return `${date ? `[${date}] ` : ""}${c.content}`;
    });

    const sources = sorted
      .map(c => c.source_session_id ?? "")
      .filter(Boolean);

    return {
      context: `Past relevant conversations:\n${lines.join("\n")}`,
      sources: [...new Set(sources)],
      pipeline: "conversation-rag",
      chunks: sorted,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] conversationRag failed:", (e as Error).message);
    return { context: "", sources: [], pipeline: "conversation-rag", chunks: [], latency_ms: Date.now() - start };
  }
}

/** Fetch last N messages from working memory and format as conversation history */
export async function buildConversationContext(
  sessionId: string,
  lastN = 10
): Promise<string> {
  try {
    const { data } = await axios.post(
      `${config.services.memoryUrl}/memory/context`,
      {
        user_id: USER_ID,
        session_id: sessionId,
      },
      { timeout: 8000 }
    );

    const working: unknown[] = Array.isArray(data.working_memory) ? data.working_memory : [];
    const recent = working.slice(-lastN);

    if (recent.length === 0) return "";

    const lines = recent.map(msg => {
      if (typeof msg !== "object" || msg === null) return String(msg);
      const m = msg as Record<string, unknown>;
      const role = typeof m["role"] === "string" ? m["role"] : "unknown";
      const content = typeof m["content"] === "string" ? m["content"] : "";
      const speaker = role === "user" ? "Heoster" : "Tillu";
      return `${speaker}: ${content}`;
    });

    const full = lines.join("\n");
    // Truncate to 2000 chars
    return full.length > 2000 ? `...${full.slice(-2000)}` : full;
  } catch (e) {
    console.warn("[RAG] buildConversationContext failed:", (e as Error).message);
    return "";
  }
}
