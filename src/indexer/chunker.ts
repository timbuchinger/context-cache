export function* chunkTextGenerator(text: string, chunkSize: number, overlap: number): Generator<string> {
  if (text.length <= chunkSize) {
    yield text;
    return;
  }

  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // If not the last chunk, try to break at word boundary
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    yield text.substring(start, end).trim();

    // Move start forward by at least (chunkSize - overlap), but at least 1 char
    const nextStart = start + (chunkSize - overlap);
    start = Math.max(nextStart, end);
    
    // Safety: prevent infinite loops by ensuring we advance
    if (start >= text.length) {
      break;
    }
  }
}

export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  return Array.from(chunkTextGenerator(text, chunkSize, overlap));
}
