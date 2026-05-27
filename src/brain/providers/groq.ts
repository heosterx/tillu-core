import Groq from "groq-sdk";
import { config } from "../../config";
import type { ChatMessage } from "./cerebras";

let _client: Groq | null = null;

function getClient(): Groq {
  if (!_client) {
    const key = config.llm.groqKey;
    if (!key) throw new Error("GROQ_API_KEY not set");
    _client = new Groq({ apiKey: key });
  }
  return _client;
}

/**
 * Call Groq llama-3.3-70b — primary planner + classifier fallback.
 * Supports function calling for structured tool plans.
 */
export async function callGroq(
  messages: ChatMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
    tools?: Groq.Chat.CompletionCreateParams.Tool[];
  }
): Promise<string> {
  const client = getClient();

  // Build request — use any to avoid SDK version type conflicts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    model: config.llm.groqModel,
    messages,
    max_tokens: options?.maxTokens ?? 1024,
    temperature: options?.temperature ?? 0.1,
    stream: false,
  };

  if (options?.jsonMode) {
    req.response_format = { type: "json_object" };
  }

  if (options?.tools && options.tools.length > 0) {
    req.tools = options.tools;
    req.tool_choice = "auto";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completion = await (client.chat.completions.create(req) as Promise<any>);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const choice = completion.choices?.[0] as any;

  // If tool calls were made, return them as JSON string
  if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
    return JSON.stringify(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      choice.message.tool_calls.map((tc: any) => ({
        tool: tc.function?.name ?? "",
        params: JSON.parse(tc.function?.arguments ?? "{}"),
      }))
    );
  }

  const text = choice?.message?.content as string | undefined;
  if (!text) throw new Error("Groq returned empty response");
  return text;
}
