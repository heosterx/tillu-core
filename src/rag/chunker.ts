// ─── Chunker — text splitting strategies ─────────────────────────────────────

export interface Chunk {
  text: string;
  index: number;
  total: number;
  startChar: number;
  endChar: number;
}

export interface SmartChunkOptions {
  maxCharsPerChunk?: number;
  chunkSize?: number;
  overlap?: number;
}

/** Sliding window by approximate token count (1 token ≈ 4 chars) */
export function chunkByTokens(
  text: string,
  chunkSize = 400,
  overlap = 80
): Chunk[] {
  const charSize = chunkSize * 4;
  const charOverlap = overlap * 4;
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + charSize, text.length);
    chunks.push({ text: text.slice(start, end), index: chunks.length, total: 0, startChar: start, endChar: end });
    if (end === text.length) break;
    start += charSize - charOverlap;
  }

  const total = chunks.length;
  return chunks.map(c => ({ ...c, total }));
}

/** Split on sentence boundaries, group N sentences per chunk */
export function chunkBySentences(
  text: string,
  maxSentences = 5,
  overlap = 1
): Chunk[] {
  const sentenceRegex = /[^.!?]+[.!?]+/g;
  const sentences: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = sentenceRegex.exec(text)) !== null) {
    sentences.push(match[0].trim());
  }

  if (sentences.length === 0) {
    return [{ text, index: 0, total: 1, startChar: 0, endChar: text.length }];
  }

  const chunks: Chunk[] = [];
  let i = 0;
  let charPos = 0;

  while (i < sentences.length) {
    const group = sentences.slice(i, i + maxSentences);
    const chunkText = group.join(" ");
    const startChar = text.indexOf(group[0]!, charPos);
    const endChar = startChar + chunkText.length;
    chunks.push({ text: chunkText, index: chunks.length, total: 0, startChar: Math.max(0, startChar), endChar });
    charPos = endChar;
    i += Math.max(1, maxSentences - overlap);
  }

  const total = chunks.length;
  return chunks.map(c => ({ ...c, total }));
}

/** Split on double newlines, merge small paragraphs */
export function chunkByParagraphs(
  text: string,
  maxCharsPerChunk = 1200
): Chunk[] {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let current = "";
  let startChar = 0;
  let currentStart = 0;

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxCharsPerChunk && current.length > 0) {
      const endChar = startChar + current.length;
      chunks.push({ text: current, index: chunks.length, total: 0, startChar, endChar });
      startChar = endChar + 2;
      current = para;
      currentStart = startChar;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current) {
    chunks.push({ text: current, index: chunks.length, total: 0, startChar: currentStart, endChar: currentStart + current.length });
  }

  const total = chunks.length;
  return chunks.map(c => ({ ...c, total }));
}

/** Split on ## headings, keep heading with its content */
export function chunkMarkdown(
  text: string,
  maxCharsPerChunk = 1000
): Chunk[] {
  const lines = text.split("\n");
  const sections: Array<{ heading: string; content: string; startChar: number }> = [];
  let current: { heading: string; content: string; startChar: number } | null = null;
  let charPos = 0;

  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line, content: "", startChar: charPos };
    } else if (current) {
      current.content += (current.content ? "\n" : "") + line;
    } else {
      current = { heading: "", content: line, startChar: charPos };
    }
    charPos += line.length + 1;
  }
  if (current) sections.push(current);

  const chunks: Chunk[] = [];
  for (const section of sections) {
    const full = section.heading ? `${section.heading}\n${section.content}` : section.content;
    if (full.length <= maxCharsPerChunk) {
      chunks.push({ text: full, index: chunks.length, total: 0, startChar: section.startChar, endChar: section.startChar + full.length });
    } else {
      // Sub-chunk large sections by tokens
      const sub = chunkByTokens(full, Math.floor(maxCharsPerChunk / 4), 20);
      for (const s of sub) {
        chunks.push({ ...s, index: chunks.length, startChar: section.startChar + s.startChar, endChar: section.startChar + s.endChar });
      }
    }
  }

  const total = chunks.length;
  return chunks.map(c => ({ ...c, total }));
}

/** Auto-selects strategy based on content type detection */
export function smartChunk(text: string, options?: SmartChunkOptions): Chunk[] {
  if (!text || text.trim().length === 0) return [];

  // Very short text — no chunking needed
  if (text.length < 500) {
    return [{ text: text.trim(), index: 0, total: 1, startChar: 0, endChar: text.length }];
  }

  // Detect markdown (has ## headings)
  if (/^#{1,3}\s/m.test(text)) {
    return chunkMarkdown(text, options?.maxCharsPerChunk ?? 1000);
  }

  // Detect structured paragraphs (double newlines)
  if (/\n\n/.test(text)) {
    return chunkByParagraphs(text, options?.maxCharsPerChunk ?? 1200);
  }

  // Long prose — token-based sliding window
  return chunkByTokens(text, options?.chunkSize ?? 400, options?.overlap ?? 80);
}
