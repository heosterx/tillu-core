import axios from "axios";
import { config } from "../config";

const BASE = config.services.voiceUrl;

/**
 * Convert text to speech via Indic Voice Hub.
 * Returns the audio URL or null on failure.
 */
export async function speak(text: string, lang = "hi"): Promise<string | null> {
  try {
    // Voice Hub returns binary audio — we need to get the URL
    // For now, call the speak endpoint and return the URL pattern
    // The UI will call this URL directly to play audio
    const url = `${BASE}/api/speak?text=${encodeURIComponent(text)}&lang=${lang}`;
    return url;
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
