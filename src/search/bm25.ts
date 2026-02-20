import Database from 'better-sqlite3';

export interface BM25Result {
  chunk_id: number;
  content: string;
  score: number;
}

export function bm25Search(db: Database.Database, query: string, limit: number): BM25Result[] {
  const stmt = db.prepare(`
    SELECT 
      chunks_fts.rowid as chunk_id,
      chunks.content,
      bm25(chunks_fts) as score
    FROM chunks_fts
    JOIN chunks ON chunks.id = chunks_fts.rowid
    WHERE chunks_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `);

  return stmt.all(query, limit) as BM25Result[];
}
