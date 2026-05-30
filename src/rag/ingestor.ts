// ─── Ingestor — document ingestion pipeline ──────────────────────────────────

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config";
import { smartChunk } from "./chunker";
import { embedBatch } from "./embedder";

const USER_ID = config.heoster.userId;

export interface IngestMetadata {
  title: string;
  source: string;
  type: "document" | "webpage" | "conversation" | "note";
  tags?: string[];
}

export interface IngestResult {
  chunksStored: number;
  documentId: string;
  metadata: IngestMetadata;
}

/** Strip HTML tags from a string */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Ingest a text document — chunk, embed, store */
export async function ingestText(
  text: string,
  metadata: IngestMetadata
): Promise<IngestResult> {
  const documentId = uuidv4();
  const chunks = smartChunk(text);

  if (chunks.length === 0) {
    console.warn("[RAG] ingestText: no chunks produced");
    return { chunksStored: 0, documentId, metadata };
  }

  let stored = 0;

  try {
    // Embed all chunks in one batch call
    const texts = chunks.map(c => c.text);
    await embedBatch(texts); // warm cache — memory API handles its own embeddings

    // Store each chunk as a memory
    for (const chunk of chunks) {
      const content = JSON.stringify({
        text: chunk.text,
        document_id: documentId,
        chunk_index: chunk.index,
        chunk_total: chunk.total,
        title: metadata.title,
        source: metadata.source,
        tags: metadata.tags ?? [],
      });

      try {
        await axios.post(
          `${config.services.memoryUrl}/memory/write`,
          {
            user_id: USER_ID,
            content,
            type: metadata.type === "conversation" ? "summary" : "fact",
            importance: "normal",
            topic_tags: metadata.tags ?? [],
            source_session_id: documentId,
          },
          { timeout: 8000 }
        );
        stored++;
      } catch (e) {
        console.warn(`[RAG] Failed to store chunk ${chunk.index}:`, (e as Error).message);
      }
    }
  } catch (e) {
    console.error("[RAG] ingestText failed:", (e as Error).message);
  }

  console.log(`[RAG] Ingested "${metadata.title}": ${stored}/${chunks.length} chunks stored`);
  return { chunksStored: stored, documentId, metadata };
}

/** Fetch URL, strip HTML, ingest as text */
export async function ingestUrl(
  url: string,
  metadata?: Partial<IngestMetadata>
): Promise<IngestResult> {
  const fullMeta: IngestMetadata = {
    title: metadata?.title ?? url,
    source: url,
    type: metadata?.type ?? "webpage",
    tags: metadata?.tags,
  };

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "TilluBot/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const text = stripHtml(html);

    if (!text || text.length < 50) {
      console.warn("[RAG] ingestUrl: extracted text too short");
      return { chunksStored: 0, documentId: uuidv4(), metadata: fullMeta };
    }

    return ingestText(text, fullMeta);
  } catch (e) {
    console.error("[RAG] ingestUrl failed:", (e as Error).message);
    return { chunksStored: 0, documentId: uuidv4(), metadata: fullMeta };
  }
}

/** Ingest a conversation as a summary memory */
export async function ingestConversation(
  messages: Array<{ role: string; content: string }>,
  sessionId: string
): Promise<IngestResult> {
  const text = messages
    .map(m => `${m.role === "user" ? "Heoster" : "Tillu"}: ${m.content}`)
    .join("\n");

  const metadata: IngestMetadata = {
    title: `Conversation ${sessionId}`,
    source: `session:${sessionId}`,
    type: "conversation",
  };

  const chunks = smartChunk(text);
  let stored = 0;
  const documentId = sessionId;

  for (const chunk of chunks) {
    try {
      await axios.post(
        `${config.services.memoryUrl}/memory/write`,
        {
          user_id: USER_ID,
          content: chunk.text,
          type: "summary",
          importance: "normal",
          source_session_id: sessionId,
        },
        { timeout: 8000 }
      );
      stored++;
    } catch (e) {
      console.warn(`[RAG] ingestConversation chunk ${chunk.index} failed:`, (e as Error).message);
    }
  }

  console.log(`[RAG] Ingested conversation ${sessionId}: ${stored}/${chunks.length} chunks`);
  return { chunksStored: stored, documentId, metadata };
}
