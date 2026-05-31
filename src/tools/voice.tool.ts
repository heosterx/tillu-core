import axios from "axios";
import { config } from "../config";

const BASE = config.services.voiceUrl;

/**
 * Convert text to speech via Indic Voice Hub.
 * Returns the audio URL or null on failure.
 */
export async function speak(text: string, lang = "hi"): Promise<string | null> {
  try {
    const { data } = await axios.post(
      `${BASE}/api/speak`,
      { text, lang },
      { timeout: 30000 }
    );
    
    // If the API returns an audio URL
    if (data?.url) {
      return data.url;
    }
    
    // If the API returns base64 audio, we'll create a data URL
    if (data?.audio) {
      return `data:audio/wav;base64,${data.audio}`;
    }
    
    // Fallback: construct the GET URL as before
    return `${BASE}/api/speak?text=${encodeURIComponent(text)}&lang=${lang}`;
  } catch (e) {
    console.warn("[Voice] speak failed:", (e as Error).message);
    return null;
  }
}

/**
 * Transcribe audio to text via Indic Voice Hub.
 */
export async function transcribe(
  audioBase64: string,
  lang = "hi",
  contentType = "audio/webm"
): Promise<string> {
  try {
    const { data } = await axios.post(`${BASE}/api/listen`, {
      audio: audioBase64,
      lang,
      contentType,
    }, { timeout: 20000 });

    return data.text ?? "";
  } catch (e) {
    console.warn("[Voice] transcribe failed:", (e as Error).message);
    return "";
  }
}
