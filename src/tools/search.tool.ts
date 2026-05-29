import axios from "axios";
import { config } from "../config";

// Always use the smart search URL — override any stale env var
const BASE = config.services.searchUrl.includes("tillu-search.vercel.app")
  ? "https://tillu-smart-search.vercel.app"   // auto-correct stale env var
  : config.services.searchUrl;

export interface SearchResult {
  answer: string;
  key_points: string[];
  sources: Array<{ title: string; url: string; snippet?: string }>;
  videos: Array<{ title: string; url: string; thumbnail?: string }>;
  latency_ms: number;
}

/**
 * Search the web via Tillu-Smart-Search.
 * URL format: GET /api/unified?q=<query>&mode=<fast|full>&category=<general|news|videos>
 */
export async function search(
  query: string,
  mode: "fast" | "full" | "search" = "fast",
  category: "general" | "videos" | "news" | "images" = "general"
): Promise<SearchResult> {
  const url = `${BASE}/api/unified`;
  console.log(`[Search] GET ${url}?q=${encodeURIComponent(query)}&mode=${mode}&category=${category}`);

  try {
    const { data } = await axios.get(url, {
      params: { q: query, mode, category },
      timeout: 30000,   // search API can take ~5s
    });

    if (!data.success) throw new Error(data.error ?? "Search returned success=false");

    // Response shape: data.structured (preferred) → data.synthesis → fallback
    const structured = data.structured ?? data.synthesis ?? {};

    return {
      answer:     structured.answer   ?? structured.summary ?? "",
      key_points: structured.key_points ?? [],
      sources:    (data.results?.search ?? structured.sources ?? [])
                    .slice(0, 5)
                    .map((s: { title: string; url: string; snippet?: string }) => ({
                      title:   s.title,
                      url:     s.url,
                      snippet: s.snippet,
                    })),
      videos:     (data.results?.videos ?? structured.videos ?? []).slice(0, 3),
      latency_ms: data.meta?.latency_ms ?? 0,
    };
  } catch (e) {
    const msg = (e as Error).message;
    console.warn("[Search] failed:", msg.slice(0, 100));
    return {
      answer:     `Search failed: ${msg.slice(0, 80)}`,
      key_points: [],
      sources:    [],
      videos:     [],
      latency_ms: 0,
    };
  }
}

/**
 * Format search results as a concise string for the Writer prompt.
 */
export function formatSearchResult(result: SearchResult): string {
  if (!result.answer && result.key_points.length === 0) return "";

  const parts: string[] = [];

  if (result.answer) {
    parts.push(`Answer: ${result.answer.slice(0, 300)}`);
  }

  if (result.key_points.length > 0) {
    parts.push(`Key points: ${result.key_points.slice(0, 4).join("; ")}`);
  }

  if (result.sources.length > 0) {
    parts.push(`Sources: ${result.sources.map(s => s.title).join(", ")}`);
  }

  return parts.join("\n");
}
