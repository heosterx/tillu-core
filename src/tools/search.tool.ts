import axios from "axios";
import { config } from "../config";

const BASE = config.services.searchUrl;

export interface SearchResult {
  answer: string;
  key_points: string[];
  sources: Array<{ title: string; url: string }>;
  videos: Array<{ title: string; url: string; thumbnail?: string }>;
  latency_ms: number;
}

/**
 * Search the web and return AI-synthesized results.
 */
export async function search(
  query: string,
  mode: "fast" | "full" | "search" = "fast",
  category: "general" | "videos" | "news" | "images" = "general"
): Promise<SearchResult> {
  try {
    const { data } = await axios.get(`${BASE}/api/unified`, {
      params: { q: query, mode, category },
      timeout: 25000,
    });

    if (!data.success) throw new Error(data.error ?? "Search failed");

    const structured = data.structured ?? data.synthesis ?? {};
    return {
      answer: structured.answer ?? "",
      key_points: structured.key_points ?? [],
      sources: (data.results?.search ?? []).slice(0, 5).map((s: { title: string; url: string }) => ({
        title: s.title,
        url: s.url,
      })),
      videos: (data.results?.videos ?? []).slice(0, 3),
      latency_ms: data.meta?.latency_ms ?? 0,
    };
  } catch (e) {
    console.warn("[Search] failed:", (e as Error).message);
    return {
      answer: `Search failed: ${(e as Error).message}`,
      key_points: [],
      sources: [],
      videos: [],
      latency_ms: 0,
    };
  }
}

/**
 * Format search results as a string for the Writer prompt.
 */
export function formatSearchResult(result: SearchResult): string {
  const parts: string[] = [];
  if (result.answer) parts.push(`Answer: ${result.answer}`);
  if (result.key_points.length > 0) parts.push(`Key points: ${result.key_points.join("; ")}`);
  if (result.sources.length > 0) parts.push(`Sources: ${result.sources.map((s) => s.title).join(", ")}`);
  return parts.join("\n");
}
