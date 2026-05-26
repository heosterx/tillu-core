import axios from "axios";
import { config } from "../config";

const BASE = config.services.seeUrl;

export interface SeeResult {
  description: string;
  provider: string;
  raw: unknown;
}

/**
 * Analyze an image or screenshot via Tillu-See.
 */
export async function see(
  task: "screen_read" | "ocr" | "describe" | "chart_read" | "document_extract" | "visual_qa",
  imageBase64: string,
  question?: string
): Promise<SeeResult> {
  try {
    const { data } = await axios.post(`${BASE}/see/analyze`, {
      image: imageBase64,
      task,
      question,
    }, { timeout: 30000 });

    return {
      description: data.answer ?? data.result?.description ?? JSON.stringify(data.result),
      provider: data.provider ?? "unknown",
      raw: data.result,
    };
  } catch (e) {
    console.warn("[See] failed:", (e as Error).message);
    return {
      description: `Vision analysis failed: ${(e as Error).message}`,
      provider: "none",
      raw: null,
    };
  }
}
