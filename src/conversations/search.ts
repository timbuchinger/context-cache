/**
 * Search conversations using hybrid BM25 + vector search with RRF fusion
 */

import Database from 'better-sqlite3';
import { mergeWithRRF, RankedResult } from '../search/rrf';

export interface ConversationSearchResult {
  conversationId: string;
  sessionId: string;
  timestamp: string;
  source: string;
  exchangeIndex: number;
  exchangeId: string;
  userMessage: string;
  assistantMessage: string;
  score: number;
  archivePath: string;
}

export interface SearchOptions {
  limit?: number;
  after?: string;          // ISO timestamp
  before?: string;         // ISO timestamp
  queryEmbedding?: number[]; // When provided, enables hybrid BM25 + vector search
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function bm25SearchExchanges(
  db: Database.Database,
  query: string,
  limit: number,
  after?: string,
  before?: string
): RankedResult<string>[] {
  let sql = `
    SELECT f.exchange_id, -bm25(exchanges_fts) AS score
    FROM exchanges_fts f
    JOIN conversations c ON c.id = f.conversation_id
    WHERE exchanges_fts MATCH ?
  `;
  const params: any[] = [query];
  if (after) { sql += ' AND c.timestamp >= ?'; params.push(after); }
  if (before) { sql += ' AND c.timestamp <= ?'; params.push(before); }
  sql += ' ORDER BY bm25(exchanges_fts) ASC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params) as { exchange_id: string; score: number }[];
  return rows.map(r => ({ id: r.exchange_id, score: r.score }));
}

function cosineSimilarity(a: number[], b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function vectorSearchExchanges(
  db: Database.Database,
  queryEmbedding: number[],
  limit: number,
  after?: string,
  before?: string
): RankedResult<string>[] {
  let sql = `
    SELECT e.id, e.embedding
    FROM exchanges e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE e.embedding IS NOT NULL
  `;
  const params: any[] = [];
  if (after) { sql += ' AND c.timestamp >= ?'; params.push(after); }
  if (before) { sql += ' AND c.timestamp <= ?'; params.push(before); }

  const rows = db.prepare(sql).all(...params) as { id: string; embedding: Buffer }[];

  const scored: RankedResult<string>[] = rows.map(row => {
    const arr = new Float32Array(
      row.embedding.buffer,
      row.embedding.byteOffset,
      row.embedding.byteLength / 4
    );
    return { id: row.id, score: cosineSimilarity(queryEmbedding, arr) };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function fetchExchangeDetails(
  db: Database.Database,
  ids: string[]
): Map<string, any> {
  const map = new Map<string, any>();
  if (ids.length === 0) return map;
  const placeholders = ids.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT
      e.id, e.conversation_id, e.exchange_index,
      e.user_message, e.assistant_message, e.timestamp,
      c.session_id,
      c.timestamp AS conv_timestamp,
      c.source,
      c.archive_path
    FROM exchanges e
    JOIN conversations c ON c.id = e.conversation_id
    WHERE e.id IN (${placeholders})
  `).all(...ids) as any[];
  rows.forEach(r => map.set(r.id, r));
  return map;
}

function normalizeAndFormat(
  ranked: RankedResult<string>[],
  detailMap: Map<string, any>
): ConversationSearchResult[] {
  if (ranked.length === 0) return [];
  const maxScore = ranked[0].score;
  const minScore = ranked[ranked.length - 1].score;
  const scoreRange = maxScore - minScore;

  return ranked
    .map(r => {
      const row = detailMap.get(r.id);
      if (!row) return null;
      const normalizedScore = scoreRange > 0 ? (r.score - minScore) / scoreRange : 1.0;
      return {
        conversationId: row.conversation_id,
        sessionId: row.session_id,
        timestamp: row.conv_timestamp,
        source: row.source,
        exchangeIndex: row.exchange_index,
        exchangeId: row.id,
        userMessage: row.user_message,
        assistantMessage: row.assistant_message,
        score: normalizedScore,
        archivePath: row.archive_path,
      };
    })
    .filter((r): r is ConversationSearchResult => r !== null);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchConversations(
  db: Database.Database,
  query: string,
  options: SearchOptions = {}
): Promise<ConversationSearchResult[]> {
  const { limit = 10, after, before, queryEmbedding } = options;

  // Check if FTS table exists (may not in older databases)
  const ftsExists = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='exchanges_fts'`
  ).get();

  if (!ftsExists) {
    // Legacy LIKE fallback for old databases without FTS
    let sql = `
      SELECT
        e.id AS exchange_id, e.conversation_id, e.exchange_index,
        e.user_message, e.assistant_message, e.timestamp AS exchange_timestamp,
        c.session_id, c.timestamp AS conversation_timestamp, c.source, c.archive_path
      FROM exchanges e
      JOIN conversations c ON e.conversation_id = c.id
      WHERE (e.user_message LIKE ? OR e.assistant_message LIKE ?)
    `;
    const params: any[] = [`%${query}%`, `%${query}%`];
    if (after) { sql += ' AND c.timestamp >= ?'; params.push(after); }
    if (before) { sql += ' AND c.timestamp <= ?'; params.push(before); }
    sql += ' ORDER BY c.timestamp DESC, e.exchange_index ASC LIMIT ?';
    params.push(limit);
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map(row => ({
      conversationId: row.conversation_id,
      sessionId: row.session_id,
      timestamp: row.conversation_timestamp,
      source: row.source,
      exchangeIndex: row.exchange_index,
      exchangeId: row.exchange_id,
      userMessage: row.user_message,
      assistantMessage: row.assistant_message,
      score: 1.0,
      archivePath: row.archive_path,
    }));
  }

  // BM25 candidates (2× limit to give RRF more to work with)
  const bm25Results = bm25SearchExchanges(db, query, limit * 2, after, before);

  let ranked: RankedResult<string>[];

  if (queryEmbedding && queryEmbedding.length > 0) {
    // Hybrid: fuse BM25 + vector with Reciprocal Rank Fusion
    const vectorResults = vectorSearchExchanges(db, queryEmbedding, limit * 2, after, before);
    ranked = mergeWithRRF([bm25Results, vectorResults], 60);
  } else {
    // BM25 only
    ranked = bm25Results;
  }

  const topResults = ranked.slice(0, limit);
  const detailMap = fetchExchangeDetails(db, topResults.map(r => r.id));
  return normalizeAndFormat(topResults, detailMap);
}

export function formatConversationResults(
  results: ConversationSearchResult[],
  format: 'markdown' | 'json' = 'markdown'
): string {
  if (format === 'json') {
    return JSON.stringify({ results }, null, 2);
  }
  
  if (results.length === 0) {
    return 'No conversations found matching your query.';
  }
  
  let output = `# Conversation Search Results (${results.length})\n\n`;
  
  for (const result of results) {
    const date = new Date(result.timestamp).toLocaleString();
    
    output += `## ${result.source} - ${date}\n`;
    output += `**Session:** ${result.sessionId.substring(0, 8)}...\n`;
    output += `**Exchange:** ${result.exchangeIndex}\n`;
    output += `**Path:** ${result.archivePath}\n\n`;
    
    output += `**User:**\n`;
    output += result.userMessage.substring(0, 200);
    if (result.userMessage.length > 200) output += '...';
    output += '\n\n';
    
    output += `**Assistant:**\n`;
    output += result.assistantMessage.substring(0, 300);
    if (result.assistantMessage.length > 300) output += '...';
    output += '\n\n';
    
    output += '---\n\n';
  }
  
  return output;
}
