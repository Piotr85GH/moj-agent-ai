function createOverlap(text: string, overlap: number) {
  if (overlap <= 0 || text.length <= overlap) {
    return text;
  }

  const slice = text.slice(-overlap);
  const wordStart = slice.search(/\S/);

  return wordStart >= 0 ? slice.slice(wordStart) : slice;
}

export function splitIntoChunks(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  if (!normalized) {
    return [];
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    const candidate = `${current} ${sentence}`.trim();

    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    chunks.push(current);
    const nextPrefix = createOverlap(current, overlap);
    current = `${nextPrefix} ${sentence}`.trim();

    while (current.length > chunkSize * 1.5) {
      chunks.push(current.slice(0, chunkSize).trim());
      current = `${createOverlap(current.slice(0, chunkSize), overlap)} ${current
        .slice(chunkSize)
        .trim()}`.trim();
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
