// ─── Skill RAG — skill and action context pipeline ───────────────────────────

import { retrieve } from "../retriever";
import type { RetrievedChunk } from "../retriever";
import type { RagResult } from "./memory-rag";

/** Retrieve past action logs and skill feedback relevant to the input */
export async function skillContextRag(userInput: string): Promise<RagResult> {
  const start = Date.now();

  try {
    const [actionChunks, skillChunks] = await Promise.all([
      retrieve(userInput, { topK: 4, minScore: 0.2, type: "action_log", rerank: true }),
      retrieve(userInput, { topK: 3, minScore: 0.2, type: "skill_feedback", rerank: false }),
    ]);

    // Deduplicate
    const seen = new Set<string>();
    const chunks: RetrievedChunk[] = [];
    for (const c of [...actionChunks, ...skillChunks]) {
      const key = c.id || c.content.slice(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        chunks.push(c);
      }
    }

    const sorted = chunks.sort((a, b) => b.score - a.score).slice(0, 6);

    if (sorted.length === 0) {
      return { context: "", sources: [], pipeline: "skill-rag", chunks: [], latency_ms: Date.now() - start };
    }

    const lines = sorted.map(c => {
      let text = c.content;
      let outcome = "";

      try {
        const parsed: unknown = JSON.parse(c.content);
        if (typeof parsed === "object" && parsed !== null) {
          const p = parsed as Record<string, unknown>;
          const action = typeof p["action_type"] === "string" ? p["action_type"] : "";
          const success = typeof p["success"] === "boolean" ? p["success"] : null;
          const skill = typeof p["skill_name"] === "string" ? p["skill_name"] : "";
          const latency = typeof p["latency_ms"] === "number" ? `${p["latency_ms"]}ms` : "";

          if (action || skill) {
            text = [action, skill].filter(Boolean).join(" / ");
            outcome = success !== null ? (success ? "✓ succeeded" : "✗ failed") : "";
            if (latency) outcome += ` (${latency})`;
          }
        }
      } catch {
        // Use raw content
      }

      return `• ${text}${outcome ? ` — ${outcome}` : ""}`;
    });

    const sources = sorted
      .map(c => c.source_session_id ?? c.type ?? "")
      .filter(Boolean);

    return {
      context: `Past action context:\n${lines.join("\n")}`,
      sources: [...new Set(sources)],
      pipeline: "skill-rag",
      chunks: sorted,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] skillContextRag failed:", (e as Error).message);
    return { context: "", sources: [], pipeline: "skill-rag", chunks: [], latency_ms: Date.now() - start };
  }
}

/** Retrieve history of a specific action type */
export async function actionHistoryRag(actionType: string): Promise<RagResult> {
  const start = Date.now();

  try {
    const chunks = await retrieve(actionType, {
      topK: 10,
      minScore: 0.15,
      type: "action_log",
      rerank: false,
    });

    if (chunks.length === 0) {
      return { context: "", sources: [], pipeline: "action-history-rag", chunks: [], latency_ms: Date.now() - start };
    }

    let successCount = 0;
    let totalCount = 0;
    const paramExamples: string[] = [];
    let lastUsed = "";

    for (const chunk of chunks) {
      try {
        const parsed: unknown = JSON.parse(chunk.content);
        if (typeof parsed === "object" && parsed !== null) {
          const p = parsed as Record<string, unknown>;
          totalCount++;
          if (p["success"] === true) successCount++;
          if (p["params"] && paramExamples.length < 3) {
            paramExamples.push(JSON.stringify(p["params"]));
          }
          if (!lastUsed && chunk.created_at) lastUsed = chunk.created_at;
        }
      } catch {
        totalCount++;
      }
    }

    const successRate = totalCount > 0 ? `${Math.round((successCount / totalCount) * 100)}%` : "unknown";
    const contextLines = [
      `Action: ${actionType}`,
      `Success rate: ${successRate} (${successCount}/${totalCount})`,
      lastUsed ? `Last used: ${new Date(lastUsed).toLocaleDateString("en-IN")}` : "",
      paramExamples.length > 0 ? `Common params: ${paramExamples.join(", ")}` : "",
    ].filter(Boolean);

    return {
      context: contextLines.join("\n"),
      sources: ["action_log"],
      pipeline: "action-history-rag",
      chunks,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] actionHistoryRag failed:", (e as Error).message);
    return { context: "", sources: [], pipeline: "action-history-rag", chunks: [], latency_ms: Date.now() - start };
  }
}
