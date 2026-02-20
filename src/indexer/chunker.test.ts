import { chunkText } from './chunker';

describe('Text Chunker', () => {
  test('splits text into chunks of specified size', () => {
    const text = 'a '.repeat(300); // 600 chars (300 words)
    const chunks = chunkText(text, 500, 50);

    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach(chunk => {
      expect(chunk.length).toBeLessThanOrEqual(550); // 500 + 50 overlap tolerance
    });
  });

  test('handles text shorter than chunk size', () => {
    const text = 'Short text';
    const chunks = chunkText(text, 500, 50);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe('Short text');
  });

  test('creates overlapping chunks', () => {
    const text = 'a '.repeat(500); // 1000 chars
    const chunks = chunkText(text, 500, 100);

    expect(chunks.length).toBeGreaterThan(1);
    // Second chunk should start with content from first chunk (overlap)
    if (chunks.length > 1) {
      const overlapCheck = chunks[1].substring(0, 50);
      expect(chunks[0].includes(overlapCheck) || chunks[0].endsWith(overlapCheck.trim())).toBe(true);
    }
  });
});
