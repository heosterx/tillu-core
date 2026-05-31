/**
 * news-weather.tool.ts — Tillu-News&Weather integration.
 *
 * Endpoints:
 *   GET /api/news?query=<topic>
 *   GET /api/weather?city=<city>
 *
 * Heoster's default city: Muzaffarnagar, Uttar Pradesh, India
 */

import axios from "axios";
import { config } from "../config";

const BASE = config.services.newsWeatherUrl;
const DEFAULT_CITY = "Muzaffarnagar";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt?: string;
}

export interface NewsResult {
  articles: NewsArticle[];
  source: string;       // which provider responded
  query: string;
  summary: string;      // formatted for Writer prompt
}

export interface WeatherResult {
  city: string;
  temp_c: number;
  feels_like_c: number;
  condition: string;
  humidity: number;
  wind_kph: number;
  source: string;
  summary: string;      // formatted for Writer prompt
}

// ─── News ─────────────────────────────────────────────────────────────────────

export async function getNews(query = "India top headlines"): Promise<NewsResult> {
  try {
    const { data } = await axios.get(`${BASE}/api/news`, {
      params: { query },
      timeout: 15000,
    });

    // Normalise across NewsAPI and GNews response shapes
    const rawArticles: Array<Record<string, unknown>> =
      data.data?.articles ??       // NewsAPI
      data.articles ??             // GNews
      [];

    const articles: NewsArticle[] = rawArticles.slice(0, 5).map(a => ({
      title:       String(a.title ?? ""),
      description: String(a.description ?? a.content ?? "").slice(0, 200),
      url:         String(a.url ?? ""),
      source:      String((a.source as Record<string, unknown>)?.name ?? a.source ?? ""),
      publishedAt: String(a.publishedAt ?? a.publishedAt ?? ""),
    }));

    const summary = articles.length > 0
      ? articles.map((a, i) => `${i + 1}. ${a.title}${a.description ? ` — ${a.description}` : ""}`).join("\n")
      : "No news articles found.";

    return { articles, source: data.source ?? "unknown", query, summary };
  } catch (e) {
    console.warn("[News] failed:", (e as Error).message.slice(0, 80));
    return { articles: [], source: "error", query, summary: `News fetch failed: ${(e as Error).message.slice(0, 60)}` };
  }
}

// ─── Weather ──────────────────────────────────────────────────────────────────

export async function getWeather(city = DEFAULT_CITY): Promise<WeatherResult> {
  try {
    const { data } = await axios.get(`${BASE}/api/weather`, {
      params: { city },
      timeout: 10000,
    });

    const raw = data.data;
    let result: WeatherResult;

    if (data.source === "OpenWeather") {
      // OpenWeatherMap shape
      const tempK = (raw.main?.temp as number) ?? 273.15;
      const feelsK = (raw.main?.feels_like as number) ?? 273.15;
      result = {
        city:         raw.name ?? city,
        temp_c:       Math.round(tempK - 273.15),
        feels_like_c: Math.round(feelsK - 273.15),
        condition:    String((raw.weather as Array<Record<string, unknown>>)?.[0]?.description ?? ""),
        humidity:     Number(raw.main?.humidity ?? 0),
        wind_kph:     Math.round(Number(raw.wind?.speed ?? 0) * 3.6),
        source:       "OpenWeather",
        summary:      "",
      };
    } else {
      // WeatherAPI shape
      const current = raw.current ?? {};
      result = {
        city:         String(raw.location?.name ?? city),
        temp_c:       Number(current.temp_c ?? 0),
        feels_like_c: Number(current.feelslike_c ?? 0),
        condition:    String(current.condition?.text ?? ""),
        humidity:     Number(current.humidity ?? 0),
        wind_kph:     Number(current.wind_kph ?? 0),
        source:       "WeatherAPI",
        summary:      "",
      };
    }

    result.summary = `${result.city}: ${result.temp_c}°C, feels like ${result.feels_like_c}°C, ${result.condition}. Humidity ${result.humidity}%, wind ${result.wind_kph} km/h.`;
    return result;

  } catch (e) {
    console.warn("[Weather] failed:", (e as Error).message.slice(0, 80));
    return {
      city,
      temp_c: 0, feels_like_c: 0,
      condition: "unavailable",
      humidity: 0, wind_kph: 0,
      source: "error",
      summary: `Weather fetch failed for ${city}: ${(e as Error).message.slice(0, 60)}`,
    };
  }
}

// ─── Formatted strings for Writer prompt ─────────────────────────────────────

export function formatNews(result: NewsResult): string {
  if (!result.articles.length) return result.summary;
  return `News (${result.query}):\n${result.summary}`;
}

export function formatWeather(result: WeatherResult): string {
  return `Weather: ${result.summary}`;
}
