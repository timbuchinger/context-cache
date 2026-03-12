import Database from 'better-sqlite3';

export interface BM25Result {
  chunk_id: number;
  content: string;
  score: number;
}

/**
 * Sanitize a user query for safe use in SQLite FTS5 MATCH expressions.
 * FTS5 treats hyphens as NOT operators (e.g. "test-driven" → "test NOT driven"),
 * which causes SQLite to interpret the right-hand side as a column name and fail.
 * Replacing FTS5 operator characters with spaces preserves the search terms while
 * preventing invalid syntax.
 */
export function sanitizeFts5Query(query: string): string {
  return query
    .replace(/[-+*"^():]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  return stmt.all(sanitizeFts5Query(query), limit) as BM25Result[];
}
