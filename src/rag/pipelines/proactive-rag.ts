// ─── Proactive RAG — proactive suggestion pipeline ───────────────────────────

import { retrieve, retrieveMultiQuery } from "../retriever";
import type { RetrievedChunk } from "../retriever";
import type { SenseContext } from "../../types";
import type { RagResult } from "./memory-rag";

/** Build queries from current sense context */
function buildContextQueries(senseContext: SenseContext): string[] {
  const queries: string[] = [];

  if (senseContext.active_app) {
    queries.push(`using ${senseContext.active_app}`);
  }
  if (senseContext.user_state) {
    queries.push(`Heoster ${senseContext.user_state}`);
  }
  if (senseContext.intent_signals.length > 0) {
    queries.push(senseContext.intent_signals.join(" "));
  }
  if (senseContext.active_window_title) {
    queries.push(senseContext.active_window_title);
  }
  if (senseContext.time_ist) {
    // Extract time of day for context
    const hour = new Date(senseContext.time_ist).getHours();
    if (hour >= 6 && hour < 12) queries.push("morning routine study");
    else if (hour >= 12 && hour < 17) queries.push("afternoon school work");
    else if (hour >= 17 && hour < 21) queries.push("evening homework");
    else queries.push("night late study");
  }

  return queries.filter(Boolean).slice(0, 4);
}

/** Retrieve context for proactive suggestions based on current user state */
export async function proactiveContextRag(senseContext: SenseContext): Promise<RagResult> {
  const start = Date.now();

  try {
    const queries = buildContextQueries(senseContext);

    if (queries.length === 0) {
      return { context: "", sources: [], pipeline: "proactive-rag", chunks: [], latency_ms: Date.now() - start };
    }

    const [memoryChunks, eventChunks] = await Promise.all([
      retrieveMultiQuery(queries, { topK: 4, minScore: 0.2, rerank: true }),
      retrieve("upcoming event exam birthday reminder", { topK: 3, minScore: 0.15, type: "event", rerank: false }),
    ]);

    // Deduplicate
    const seen = new Set<string>();
    const chunks: RetrievedChunk[] = [];
    for (const c of [...memoryChunks, ...eventChunks]) {
      const key = c.id || c.content.slice(0, 40);
      if (!seen.has(key)) {
        seen.add(key);
        chunks.push(c);
      }
    }

    const sorted = chunks.sort((a, b) => b.score - a.score).slice(0, 6);

    if (sorted.length === 0) {
      return { context: "", sources: [], pipeline: "proactive-rag", chunks: [], latency_ms: Date.now() - start };
    }

    const contextParts: string[] = [
      `Current state: ${senseContext.user_state} | App: ${senseContext.active_app} | Time: ${senseContext.time_ist}`,
      `Relevant context:\n${sorted.map(c => `• ${c.content}`).join("\n")}`,
    ];

    const sources = sorted
      .map(c => c.source_session_id ?? c.type ?? "")
      .filter(Boolean);

    return {
      context: contextParts.join("\n\n"),
      sources: [...new Set(sources)],
      pipeline: "proactive-rag",
      chunks: sorted,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] proactiveContextRag failed:", (e as Error).message);
    return { context: "", sources: [], pipeline: "proactive-rag", chunks: [], latency_ms: Date.now() - start };
  }
}

/** Find recurring patterns in Heoster's behavior */
export async function patternRag(pattern: string): Promise<RagResult> {
  const start = Date.now();

  try {
    const chunks = await retrieveMultiQuery(
      [pattern, `recurring ${pattern}`, `habit ${pattern} routine`],
      { topK: 8, minScore: 0.15, rerank: true }
    );

    if (chunks.length === 0) {
      return { context: "", sources: [], pipeline: "pattern-rag", chunks: [], latency_ms: Date.now() - start };
    }

    // Count frequency by content similarity (group similar chunks)
    const patternGroups = new Map<string, number>();
    for (const chunk of chunks) {
      const key = chunk.content.slice(0, 60);
      patternGroups.set(key, (patternGroups.get(key) ?? 0) + 1);
    }

    const lines: string[] = [];
    for (const [key, count] of patternGroups.entries()) {
      lines.push(`• "${key}..." — seen ${count}x`);
    }

    const sources = chunks
      .map(c => c.source_session_id ?? "")
      .filter(Boolean);

    return {
      context: `Pattern analysis for "${pattern}":\n${lines.join("\n")}`,
      sources: [...new Set(sources)],
      pipeline: "pattern-rag",
      chunks,
      latency_ms: Date.now() - start,
    };
  } catch (e) {
    console.error("[RAG] patternRag failed:", (e as Error).message);
    return { context: "", sources: [], pipeline: "pattern-rag", chunks: [], latency_ms: Date.now() - start };
  }
}
