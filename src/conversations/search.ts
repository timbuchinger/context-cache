/**
 * Search conversations using text and/or semantic search
 */

import Database from 'better-sqlite3';
import { Exchange } from './types';

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
  after?: string;  // ISO timestamp
  before?: string; // ISO timestamp
}

export async function searchConversations(
  db: Database.Database,
  query: string,
  options: SearchOptions = {}
): Promise<ConversationSearchResult[]> {
  const { limit = 10, after, before } = options;
  
  let sql = `
    SELECT 
      e.id as exchange_id,
      e.conversation_id,
      e.exchange_index,
      e.user_message,
      e.assistant_message,
      e.timestamp as exchange_timestamp,
      c.session_id,
      c.timestamp as conversation_timestamp,
      c.source,
      c.archive_path
    FROM exchanges e
    JOIN conversations c ON e.conversation_id = c.id
    WHERE (
      e.user_message LIKE ? 
      OR e.assistant_message LIKE ?
    )
  `;
  
  const params: any[] = [`%${query}%`, `%${query}%`];
  
  if (after) {
    sql += ' AND c.timestamp >= ?';
    params.push(after);
  }
  
  if (before) {
    sql += ' AND c.timestamp <= ?';
    params.push(before);
  }
  
  sql += ' ORDER BY c.timestamp DESC, e.exchange_index ASC LIMIT ?';
  params.push(limit);
  
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as any[];
  
  return rows.map(row => ({
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    timestamp: row.conversation_timestamp,
    source: row.source,
    exchangeIndex: row.exchange_index,
    exchangeId: row.exchange_id,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    score: 1.0, // Text search doesn't have a score
    archivePath: row.archive_path,
  }));
}

export async function vectorSearchConversations(
  db: Database.Database,
  queryEmbedding: number[],
  options: SearchOptions = {}
): Promise<ConversationSearchResult[]> {
  const { limit = 10, after, before } = options;
  
  // Check if we have any embeddings
  const hasEmbeddings = db.prepare(
    'SELECT COUNT(*) as count FROM exchanges WHERE embedding IS NOT NULL'
  ).get() as { count: number };
  
  if (hasEmbeddings.count === 0) {
    return [];
  }
  
  // For now, return empty - full vector search requires sqlite-vec or similar
  // This is a placeholder for when we add proper vector search
  return [];
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
