import { getConfig } from '../shared/config';

export interface Embedder {
  generateEmbedding(text: string): Promise<number[]>;
}

export async function createEmbedder(): Promise<Embedder> {
  const ollamaUrl = getConfig('ollamaUrl');
  const ollamaModel = getConfig('ollamaEmbedModel');

  // Verify Ollama is accessible
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('Ollama server returned error');
    }
  } catch (error) {
    throw new Error(
      `Cannot connect to Ollama at ${ollamaUrl}. ` +
      `Make sure Ollama is running: ollama serve\n` +
      `Or set OLLAMA_API_URL environment variable.`
    );
  }

  const embedder: Embedder = {
    async generateEmbedding(text: string): Promise<number[]> {
      const response = await fetch(`${ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          input: text
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding failed: ${response.statusText}`);
      }

      const data = (await response.json()) as { embeddings: number[][] };
      
      // Return first embedding (single text input)
      if (!data.embeddings || data.embeddings.length === 0) {
        throw new Error('No embeddings returned from Ollama');
      }

      return data.embeddings[0];
    }
  };

  return embedder;
}
