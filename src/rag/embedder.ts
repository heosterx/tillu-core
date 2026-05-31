/**
 * embedder.ts — Jina AI embeddings (same model as Tillu-memory)
 *
 * Model: jina-embeddings-v2-base-en → 768 dimensions
 * Reachable from both Vercel and local environments.
 * Free tier: 1M tokens/month
 *
 * LOCKED at 768 dims — must match Supabase vector(768) column.
 */

import axios from "axios";
import { config } from "../config";

const JINA_MODEL = "jina-embeddings-v2-base-en";
const JINA_URL   = "https://api.jina.ai/v1/embeddings";

// LRU-style cache: Map preserves insertion order
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX = 50;

function cacheGet(key: string): number[] | undefined {
  const val = embeddingCache.get(key);
  if (val !== undefined) {
    embeddingCache.delete(key);
    embeddingCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: number[]): void {
  if (embeddingCache.size >= CACHE_MAX) {
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, val);
}

async function jinaRequest(inputs: string[]): Promise<number[][]> {
  const { data } = await axios.post(
    JINA_URL,
    { model: JINA_MODEL, input: inputs },
    {
      headers: {
        Authorization: `Bearer ${config.llm.jinaKey}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );

  // Jina returns { data: [{ embedding, index }] } — sort by index
  const sorted = (data.data as Array<{ embedding: number[]; index: number }>)
    .sort((a, b) => a.index - b.index);
  return sorted.map(d => d.embedding);
}

/** Embed a single text → 768-dim vector */
export async function embedText(text: string): Promise<number[]> {
  const cached = cacheGet(text);
  if (cached) return cached;

  try {
    const vecs = await jinaRequest([text]);
    const vec = vecs[0]!;
    cacheSet(text, vec);
    return vec;
  } catch (e) {
    console.error("[RAG] embedText failed:", (e as Error).message);
    throw e;
  }
}

/** Batch embed multiple texts */
export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const results: Array<number[] | null> = texts.map(t => cacheGet(t) ?? null);
  const missingTexts = texts.filter((_, i) => results[i] === null);

  if (missingTexts.length > 0) {
    try {
      const vecs = await jinaRequest(missingTexts);
      let vi = 0;
      for (let i = 0; i < texts.length; i++) {
        if (results[i] === null) {
          const vec = vecs[vi++] ?? [];
          results[i] = vec;
          cacheSet(texts[i]!, vec);
        }
      }
    } catch (e) {
      console.error("[RAG] embedBatch failed:", (e as Error).message);
      throw e;
    }
  }

  return results.map(r => r ?? []);
}

/** Cosine similarity between two vectors */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Embed query + all candidates, sort by cosine similarity */
export async function rerankByEmbedding(
  query: string,
  candidates: string[]
): Promise<Array<{ text: string; score: number }>> {
  if (candidates.length === 0) return [];

  try {
    const [queryVec, candidateVecs] = await Promise.all([
      embedText(query),
      embedBatch(candidates),
    ]);

    return candidates
      .map((text, i) => ({
        text,
        score: cosineSimilarity(queryVec, candidateVecs[i] ?? []),
      }))
      .sort((a, b) => b.score - a.score);
  } catch (e) {
    console.error("[RAG] rerankByEmbedding failed:", (e as Error).message);
    return candidates.map(text => ({ text, score: 0 }));
  }
}
