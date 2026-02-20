import Database from 'better-sqlite3';

export interface VectorResult {
  chunk_id: number;
  content: string;
  similarity: number;
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function vectorSearch(
  db: Database.Database,
  queryEmbedding: number[],
  limit: number
): VectorResult[] {
  // Get all chunks with embeddings
  const stmt = db.prepare('SELECT id, content, embedding FROM chunks WHERE embedding IS NOT NULL');
  const chunks = stmt.all() as Array<{ id: number; content: string; embedding: Buffer }>;

  // Calculate similarity for each chunk
  const results = chunks.map(chunk => {
    const embeddingArray = new Float32Array(
      chunk.embedding.buffer,
      chunk.embedding.byteOffset,
      chunk.embedding.byteLength / 4
    );
    const similarity = cosineSimilarity(queryEmbedding, embeddingArray);

    return {
      chunk_id: chunk.id,
      content: chunk.content,
      similarity
    };
  });

  // Sort by similarity descending and limit
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, limit);
}
