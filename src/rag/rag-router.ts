// ─── RAG Router — central pipeline selector ──────────────────────────────────

import type { Intent, SenseContext } from "../types";
import type { RagResult } from "./pipelines/memory-rag";
import type { RetrievedChunk } from "./retriever";

export interface RagRouterInput {
  query: string;
  intent: Intent;
  sessionId: string;
  senseContext?: SenseContext;
  documentId?: string;
  searchResults?: string;
}

const EMPTY_RESULT: RagResult = {
  context: "",
  sources: [],
  pipeline: "none",
  chunks: [] as RetrievedChunk[],
  latency_ms: 0,
};

/** Route to the appropriate RAG pipeline based on intent */
export async function routeRag(input: RagRouterInput): Promise<RagResult> {
  const start = Date.now();
  const { query, intent, sessionId, senseContext, documentId, searchResults } = input;

  console.log(`[RAG] Routing intent="${intent}" query="${query.slice(0, 60)}"`);

  try {
    let result: RagResult;

    switch (intent) {
      case "memory": {
        const { memoryRagWithRewrite } = await import("./pipelines/memory-rag");
        result = await memoryRagWithRewrite(query, sessionId);
        break;
      }

      case "question": {
        if (searchResults && searchResults.trim().length > 0) {
          const { hybridKnowledgeRag } = await import("./pipelines/knowledge-rag");
          result = await hybridKnowledgeRag(query, searchResults, "");
        } else {
          const { knowledgeRag } = await import("./pipelines/knowledge-rag");
          result = await knowledgeRag(query, "");
        }
        break;
      }

      case "search": {
        if (searchResults && searchResults.trim().length > 0) {
          const { hybridKnowledgeRag } = await import("./pipelines/knowledge-rag");
          result = await hybridKnowledgeRag(query, searchResults, "");
        } else {
          const { knowledgeRag } = await import("./pipelines/knowledge-rag");
          result = await knowledgeRag(query, "");
        }
        break;
      }

      case "conversation": {
        const { conversationRag } = await import("./pipelines/conversation-rag");
        result = await conversationRag(query, sessionId);
        break;
      }

      case "system_action": {
        const { skillContextRag } = await import("./pipelines/skill-rag");
        result = await skillContextRag(query);
        break;
      }

      case "code": {
        // Code queries: knowledge RAG with code-focused rewrite
        const codeQuery = `code programming ${query}`;
        const { knowledgeRag } = await import("./pipelines/knowledge-rag");
        result = await knowledgeRag(codeQuery, "");
        result = { ...result, pipeline: "knowledge-rag-code" };
        break;
      }

      case "vision": {
        // Vision queries: use document RAG for any relevant context
        const { documentRag } = await import("./pipelines/document-rag");
        result = await documentRag(query, documentId);
        break;
      }

      case "calendar": {
        // Calendar queries: memory RAG for past events
        const { memoryRag } = await import("./pipelines/memory-rag");
        result = await memoryRag(`calendar event ${query}`, sessionId);
        break;
      }

      case "multi_step": {
        // Multi-step: combine memory + skill context
        const [{ memoryRag }, { skillContextRag }] = await Promise.all([
          import("./pipelines/memory-rag"),
          import("./pipelines/skill-rag"),
        ]);
        const [memResult, skillResult] = await Promise.all([
          memoryRag(query, sessionId),
          skillContextRag(query),
        ]);
        result = {
          context: [memResult.context, skillResult.context].filter(Boolean).join("\n\n"),
          sources: [...memResult.sources, ...skillResult.sources],
          pipeline: "multi-step-rag",
          chunks: [...memResult.chunks, ...skillResult.chunks],
          latency_ms: Date.now() - start,
        };
        break;
      }

      default: {
        // Fallback: basic memory RAG
        const { memoryRag } = await import("./pipelines/memory-rag");
        result = await memoryRag(query, sessionId);
        break;
      }
    }

    console.log(`[RAG] Pipeline="${result.pipeline}" chunks=${result.chunks.length} latency=${Date.now() - start}ms`);
    return { ...result, latency_ms: Date.now() - start };

  } catch (e) {
    console.error("[RAG] routeRag failed:", (e as Error).message);
    return { ...EMPTY_RESULT, latency_ms: Date.now() - start };
  }
}
