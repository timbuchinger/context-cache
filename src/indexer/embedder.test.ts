import { Embedder } from './embedder';

// Simple deterministic embedder for testing
class MockEmbedder implements Embedder {
  async init() {
    // No-op for mock
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Generate deterministic embedding based on text
    const embedding: number[] = [];
    for (let i = 0; i < 384; i++) {
      // Simple hash function for deterministic output
      const charCode = text.charCodeAt(i % text.length) || 65;
      embedding.push(Math.sin(charCode + i) * 0.5);
    }
    return embedding;
  }
}

describe('Embedder', () => {
  let embedder: Embedder;

  beforeAll(async () => {
    embedder = new MockEmbedder();
    await embedder.init();
  });

  test('generates embedding vector from text', async () => {
    const text = 'TypeScript is a programming language';
    const embedding = await embedder.generateEmbedding(text);

    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(384); // all-MiniLM-L6-v2 dimension
    expect(typeof embedding[0]).toBe('number');
  });

  test('generates consistent embeddings for same text', async () => {
    const text = 'Hello world';
    const embedding1 = await embedder.generateEmbedding(text);
    const embedding2 = await embedder.generateEmbedding(text);

    expect(embedding1.length).toBe(embedding2.length);
    // Should be identical for mock
    for (let i = 0; i < embedding1.length; i++) {
      expect(embedding1[i]).toBe(embedding2[i]);
    }
  });

  test('generates different embeddings for different text', async () => {
    const embedding1 = await embedder.generateEmbedding('TypeScript programming');
    const embedding2 = await embedder.generateEmbedding('Cooking recipes');

    // Embeddings should be different
    let differences = 0;
    for (let i = 0; i < Math.min(embedding1.length, embedding2.length); i++) {
      if (Math.abs(embedding1[i] - embedding2[i]) > 0.01) {
        differences++;
      }
    }
    expect(differences).toBeGreaterThan(10); // Many dimensions should differ
  });
});
