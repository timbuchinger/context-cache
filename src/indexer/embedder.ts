import { getConfig } from '../shared/config';

export interface Embedder {
  generateEmbedding(text: string): Promise<number[]>;
}

/**
 * Maximum character length sent to the embedding model.
 * nomic-embed-text has an 8192-token context window; 8000 chars is a
 * conservative safe limit that avoids HTTP 400 "input length exceeds
 * context length" errors on long exchanges.
 */
export const MAX_EMBEDDING_CHARS = 8000;

export async function createEmbedder(): Promise<Embedder> {
  const ollamaUrl = getConfig('ollamaUrl');
  const ollamaModel = getConfig('ollamaEmbedModel');

  // Verify Ollama is accessible
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`);
    if (!response.ok) {
      throw new Error('Ollama server returned error');
    }
    // Consume the response body to free memory
    await response.text();
  } catch (error) {
    throw new Error(
      `Cannot connect to Ollama at ${ollamaUrl}. ` +
      `Make sure Ollama is running: ollama serve\n` +
      `Or set OLLAMA_API_URL environment variable.`
    );
  }

  const embedder: Embedder = {
    async generateEmbedding(text: string): Promise<number[]> {
      // Truncate to avoid exceeding the model's context window
      const truncated = text.length > MAX_EMBEDDING_CHARS
        ? text.slice(0, MAX_EMBEDDING_CHARS)
        : text;

      let response;
      try {
        // Log request details for debugging
        const payload = JSON.stringify({
          model: ollamaModel,
          input: truncated
        });
        const payloadSizeKb = (payload.length / 1024).toFixed(2);

        response = await fetch(`${ollamaUrl}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });

        if (!response.ok) {
          const errorBody = await response.text();
          const errorMsg = `Ollama embedding failed: ${response.statusText} (HTTP ${response.status})`;
          console.error(
            `❌ Embedding error: ${errorMsg}\n` +
            `   Model: ${ollamaModel}\n` +
            `   Payload size: ${payloadSizeKb} KB\n` +
            `   Text length: ${truncated.length} chars\n` +
            `   URL: ${ollamaUrl}/api/embed\n` +
            `   Error body: ${errorBody.substring(0, 200)}`
          );
          throw new Error(errorMsg);
        }

        const data = (await response.json()) as { embeddings: number[][] };

        // Return first embedding (single text input)
        if (!data.embeddings || data.embeddings.length === 0) {
          throw new Error('No embeddings returned from Ollama');
        }

        const result = data.embeddings[0];

        // Explicitly help GC by nullifying large objects
        data.embeddings = [];

        return result;
      } finally {
        // Ensure response body is fully consumed
        if (response && !response.bodyUsed) {
          try {
            await response.text();
          } catch {
            // Ignore errors from finalization
          }
        }
      }
    }
  };

  return embedder;
}
