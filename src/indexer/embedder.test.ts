import { createEmbedder, Embedder, MAX_EMBEDDING_CHARS } from './embedder';

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

  test('truncates text exceeding MAX_EMBEDDING_CHARS before sending', async () => {
    let capturedInput: string | undefined;

    (global.fetch as jest.Mock).mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes('/api/tags')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: [] }),
          text: () => Promise.resolve(''),
          bodyUsed: false
        });
      }
      if (url.includes('/api/embed')) {
        const body = JSON.parse(options?.body as string);
        capturedInput = body.input;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embeddings: [new Array(768).fill(0.1)] }),
          bodyUsed: true
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    });

    const embedder = await createEmbedder();
    const oversizedText = 'a'.repeat(MAX_EMBEDDING_CHARS + 5000);
    await embedder.generateEmbedding(oversizedText);

    expect(capturedInput).toBeDefined();
    expect(capturedInput!.length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
  });

  test('exports MAX_EMBEDDING_CHARS as a positive number', () => {
    expect(typeof MAX_EMBEDDING_CHARS).toBe('number');
    expect(MAX_EMBEDDING_CHARS).toBeGreaterThan(0);
  });
});
