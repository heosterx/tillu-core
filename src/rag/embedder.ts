// ─── Embedder — HuggingFace sentence-transformers embeddings ─────────────────

import axios from "axios";
import { config } from "../config";

const HF_EMBEDDING_URL =
  "https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2";

// LRU-style cache: Map preserves insertion order
const embeddingCache = new Map<string, number[]>();
const CACHE_MAX = 50;

function cacheGet(key: string): number[] | undefined {
  const val = embeddingCache.get(key);
  if (val !== undefined) {
    // Refresh position (LRU)
    embeddingCache.delete(key);
    embeddingCache.set(key, val);
  }
  return val;
}

function cacheSet(key: string, val: number[]): void {
  if (embeddingCache.size >= CACHE_MAX) {
    // Evict oldest (first entry)
    const firstKey = embeddingCache.keys().next().value;
    if (firstKey !== undefined) embeddingCache.delete(firstKey);
  }
  embeddingCache.set(key, val);
}

async function hfRequest(inputs: string | string[], attempt = 1): Promise<unknown> {
  try {
    const { data } = await axios.post(
      HF_EMBEDDING_URL,
      { inputs },
      {
        headers: {
          Authorization: `Bearer ${config.llm.hfKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );
    return data;
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 503 && attempt < 3) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[RAG] HF model loading, retry ${attempt} in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      return hfRequest(inputs, attempt + 1);
    }
    throw e;
  }
}

function extractVector(raw: unknown): number[] {
  // HF returns either number[] or number[][] (batch of 1)
  if (Array.isArray(raw)) {
    if (raw.length > 0 && Array.isArray(raw[0])) {
      return raw[0] as number[];
    }
    return raw as number[];
  }
  throw new Error("[RAG] Unexpected embedding shape from HuggingFace");
}

/** Embed a single text → 384-dim vector */
export async function embedText(text: string): Promise<number[]> {
  const cached = cacheGet(text);
  if (cached) return cached;

  try {
    const raw = await hfRequest(text);
    const vec = extractVector(raw);
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

  // Check cache first
  const results: Array<number[] | null> = texts.map(t => cacheGet(t) ?? null);
  const missing = texts.filter((_, i) => results[i] === null);

  if (missing.length > 0) {
    try {
      const raw = await hfRequest(missing);
      let vecs: number[][];

      if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
        vecs = raw as number[][];
      } else if (Array.isArray(raw)) {
        vecs = [raw as number[]];
      } else {
        throw new Error("Unexpected batch embedding shape");
      }

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
    dot += (a[i] ?? 0) * (b[i] ?? 0);
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
