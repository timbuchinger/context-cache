export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + chunkSize;

    // If not the last chunk, try to break at word boundary
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) {
        end = lastSpace;
      }
    }

    chunks.push(text.substring(start, end).trim());

    // Move start forward, accounting for overlap
    start = end - overlap;

    // If we're at the end, break
    if (end >= text.length) {
      break;
    }
  }

  return chunks;
}
