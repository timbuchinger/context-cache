import { createEmbedder, Embedder } from './embedder';

// Mock fetch globally
global.fetch = jest.fn();

describe('Embedder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('generates embedding vector from text', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [] }),
          text: () => Promise.resolve(''),
          bodyUsed: false
        });
      }
      if (url.includes('/api/embed')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: [new Array(768).fill(0.1)] // nomic-embed-text is 768 dims
            }),
          bodyUsed: true
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const embedder = await createEmbedder();
    const text = 'TypeScript is a programming language';
    const embedding = await embedder.generateEmbedding(text);

    expect(embedding).toBeDefined();
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBe(768); // nomic-embed-text dimension
    expect(typeof embedding[0]).toBe('number');
  });

  test('generates consistent embeddings for same text', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [] }),
          text: () => Promise.resolve(''),
          bodyUsed: false
        });
      }
      if (url.includes('/api/embed')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              embeddings: [new Array(768).fill(0.5)]
            }),
          bodyUsed: true
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const embedder = await createEmbedder();
    const text = 'Hello world';
    const embedding1 = await embedder.generateEmbedding(text);
    const embedding2 = await embedder.generateEmbedding(text);

    expect(embedding1.length).toBe(embedding2.length);
    for (let i = 0; i < embedding1.length; i++) {
      expect(embedding1[i]).toBe(embedding2[i]);
    }
  });

  test('throws error when Ollama is not available', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Connection refused'));

    await expect(createEmbedder()).rejects.toThrow(/Cannot connect to Ollama/);
  });
});
