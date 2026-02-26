import Database from 'better-sqlite3';
import * as fs from 'fs';
import { hybridSearch } from '../search/hybrid';
import { createEmbedder } from '../indexer/embedder';
import { SearchResult } from '../shared/types';

export async function searchNotes(
  dbPath: string,
  query: string,
  limit: number = 10,
  minScore: number = 0.01
): Promise<SearchResult[]> {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  const db = new Database(dbPath);
  
  try {
    const embedder = await createEmbedder();
    const queryEmbedding = await embedder.generateEmbedding(query);

    const results = await hybridSearch(db, query, queryEmbedding, limit, minScore);

    return results;
  } finally {
    db.close();
  }
}
