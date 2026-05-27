import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../../config";
import type { ChatMessage } from "./cerebras";

// Don't cache the client — key may change or be invalid
function getClient(): GoogleGenerativeAI {
  const key = config.llm.googleKey;
  if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
  return new GoogleGenerativeAI(key);
}

/**
 * Call Gemini-2.5-flash-lite — primary writer + vision fallback.
 * Best free model for natural, personalized text generation.
 */
export async function callGoogle(
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: config.llm.googleModel,
    generationConfig: {
      maxOutputTokens: options?.maxTokens ?? 1024,
      temperature: options?.temperature ?? 0.7,
    },
  });

  // Convert messages to Gemini format
  // System message becomes the first user turn with special prefix
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const history = chatMessages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMessage = chatMessages[chatMessages.length - 1];
  const userInput = systemMsg
    ? `${systemMsg.content}\n\n---\n\n${lastMessage?.content ?? ""}`
    : (lastMessage?.content ?? "");

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userInput);
  const text = result.response.text();
  if (!text) throw new Error("Gemini returned empty response");
  return text;
}

/**
 * Call Gemini with an image — for vision tasks.
 */
export async function callGoogleVision(
  messages: ChatMessage[],
  base64Image: string,
  mimeType: string
): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: config.llm.googleModel });

  const systemMsg = messages.find((m) => m.role === "system");
  const lastMsg = messages.filter((m) => m.role !== "system").pop();
  const prompt = systemMsg
    ? `${systemMsg.content}\n\n${lastMsg?.content ?? ""}`
    : (lastMsg?.content ?? "Describe this image.");

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp",
      },
    },
    { text: prompt },
  ]);

  const text = result.response.text();
  if (!text) throw new Error("Gemini vision returned empty response");
  return text;
}
