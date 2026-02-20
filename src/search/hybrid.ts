import Database from 'better-sqlite3';
import { bm25Search } from './bm25';
import { vectorSearch } from './vector';
import { mergeWithRRF, RankedResult } from './rrf';
import { SearchResult } from '../shared/types';

export async function hybridSearch(
  db: Database.Database,
  query: string,
  queryEmbedding: number[],
  limit: number
): Promise<SearchResult[]> {
  // Perform BM25 search
  const bm25Results = bm25Search(db, query, limit * 2);
  
  // Perform vector search
  const vectorResults = vectorSearch(db, queryEmbedding, limit * 2);

  // Convert to RankedResult format
  const bm25Ranked: RankedResult[] = bm25Results.map(r => ({
    id: r.chunk_id,
    score: r.score
  }));

  const vectorRanked: RankedResult[] = vectorResults.map(r => ({
    id: r.chunk_id,
    score: r.similarity
  }));

  // Merge with RRF
  const merged = mergeWithRRF([bm25Ranked, vectorRanked], 60);

  // Get the results we'll actually return (before normalization)
  const topResults = merged.slice(0, limit);

  // Normalize scores to 0-1 range based on the results we're returning
  const maxScore = topResults.length > 0 ? topResults[0].score : 1;
  const minScore = topResults.length > 0 ? topResults[topResults.length - 1].score : 0;
  const scoreRange = maxScore - minScore;

  // Get chunk details and format results
  const results: SearchResult[] = [];
  
  for (const ranked of topResults) {
    const chunkStmt = db.prepare(`
      SELECT c.content, c.chunk_index, f.path
      FROM chunks c
      JOIN files f ON c.file_id = f.id
      WHERE c.id = ?
    `);
    
    const chunk = chunkStmt.get(ranked.id) as {
      content: string;
      chunk_index: number;
      path: string;
    } | undefined;

    if (chunk) {
      // Normalize score to 0-1 range (best result = 1.0)
      // If all results have same score, give them all 1.0
      const normalizedScore = scoreRange > 0 
        ? (ranked.score - minScore) / scoreRange 
        : 1.0;
      
      results.push({
        content: chunk.content,
        source_path: chunk.path,
        score: normalizedScore,
        chunk_index: chunk.chunk_index
      });
    }
  }

  return results;
}
