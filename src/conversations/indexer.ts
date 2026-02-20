/**
 * Index conversations into the database
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { Conversation, Exchange } from './types';
import { parseCopilotConversation } from './parsers/copilot';
import { parseOpencodeConversation } from './parsers/opencode';
import { Embedder } from '../indexer/embedder';
import { computeConversationFileHash } from './hashing';

export interface IndexResult {
  conversationsIndexed: number;
  exchangesIndexed: number;
  conversationsSkipped: number;
  conversationsDeleted: number;
  errors: string[];
}

export interface IndexOptions {
  embedder?: Embedder;
  sessionId?: string; // For OpenCode database
}

export async function indexConversationFile(
  db: Database.Database,
  filePath: string,
  options?: IndexOptions
): Promise<{ indexed: boolean; exchangeCount: number }> {
  // Detect conversation source by file extension
  const ext = path.extname(filePath).toLowerCase();
  const isOpenCodeDb = ext === '.db' || filePath.includes('opencode.db');

  let parsed;

  if (isOpenCodeDb) {
    // OpenCode database requires sessionId
    if (!options?.sessionId) {
      throw new Error('sessionId required for OpenCode database');
    }
    parsed = await parseOpencodeConversation(filePath, options.sessionId);
  } else {
    // Default to Copilot JSONL format
    parsed = await parseCopilotConversation(filePath);
  }

  // Compute hash of current file content
  const fileHash = computeConversationFileHash(filePath);

  // Check if conversation already exists with same hash
  const existing = getConversation(db, parsed.conversation.id);
  if (existing && existing.hash === fileHash) {
    // Conversation hasn't changed, skip it
    return { indexed: false, exchangeCount: parsed.exchanges.length };
  }

  // Generate embeddings if embedder provided
  if (options?.embedder) {
    await generateExchangeEmbeddings(parsed.exchanges, options.embedder);
  }

  const tx = db.transaction(() => {
    // First, delete all old exchanges for this conversation (cleanup orphans)
    deleteExchangesForConversation(db, parsed.conversation.id);

    // Insert/update conversation with hash
    insertConversation(db, parsed.conversation, fileHash);

    // Insert all exchanges (fresh)
    for (const exchange of parsed.exchanges) {
      insertExchange(db, exchange);

      // Store embedding if generated
      if ((exchange as any)._embedding) {
        insertExchangeEmbedding(db, exchange.id, (exchange as any)._embedding);
      }
    }
  });

  tx();
  return { indexed: true, exchangeCount: parsed.exchanges.length };
}

export async function indexConversationFiles(
  db: Database.Database,
  filePaths: string[],
  options?: IndexOptions
): Promise<IndexResult> {
  const result: IndexResult = {
    conversationsIndexed: 0,
    exchangesIndexed: 0,
    conversationsSkipped: 0,
    conversationsDeleted: 0,
    errors: [],
  };

  // Detect and remove Copilot conversations whose archive files no longer exist.
  // filePaths is always the complete set of current archive files, so any
  // copilot conversation in the DB whose archivePath is absent from this set
  // has been deleted and should be pruned.
  const filePathSet = new Set(filePaths);
  const copilotConversations = getAllConversationsBySource(db, 'copilot');
  for (const conv of copilotConversations) {
    if (conv.archivePath && !filePathSet.has(conv.archivePath)) {
      try {
        deleteConversation(db, conv.id);
        result.conversationsDeleted++;
      } catch (err) {
        result.errors.push(`Error deleting conversation ${conv.id}: ${err}`);
      }
    }
  }

  for (const filePath of filePaths) {
    try {
      const indexResult = await indexConversationFile(db, filePath, options);

      // Track results
      if (indexResult.indexed) {
        result.conversationsIndexed++;
        result.exchangesIndexed += indexResult.exchangeCount;
      } else {
        result.conversationsSkipped++;
      }
    } catch (err) {
      result.errors.push(`${filePath}: ${err}`);
    }
  }

  return result;
}

export function insertConversation(
  db: Database.Database,
  conversation: Conversation,
  hash: string
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO conversations (
      id,
      source,
      session_id,
      timestamp,
      archive_path,
      exchange_count,
      hash,
      last_indexed,
      copilot_version,
      cwd
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    conversation.id,
    conversation.source,
    conversation.sessionId,
    conversation.timestamp,
    conversation.archivePath,
    conversation.exchangeCount,
    hash,
    conversation.lastIndexed || Date.now(),
    conversation.copilotVersion || null,
    conversation.cwd || null
  );
}

export function insertExchange(
  db: Database.Database,
  exchange: Exchange
): void {
  const stmt = db.prepare(`
    INSERT INTO exchanges (
      id,
      conversation_id,
      exchange_index,
      timestamp,
      user_message,
      assistant_message,
      tool_calls,
      parent_id,
      embedding
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    exchange.id,
    exchange.conversationId,
    exchange.exchangeIndex,
    exchange.timestamp,
    exchange.userMessage,
    exchange.assistantMessage,
    exchange.toolCalls ? JSON.stringify(exchange.toolCalls) : null,
    exchange.parentId || null,
    null // embedding will be updated separately if needed
  );
}

export function getAllConversationsBySource(
  db: Database.Database,
  source: string
): (Conversation & { hash: string; archivePath: string })[] {
  const stmt = db.prepare(`SELECT * FROM conversations WHERE source = ?`);
  const rows = stmt.all(source) as any[];
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    archivePath: row.archive_path,
    exchangeCount: row.exchange_count,
    hash: row.hash,
    lastIndexed: row.last_indexed,
    copilotVersion: row.copilot_version,
    cwd: row.cwd,
  }));
}

export function deleteConversation(
  db: Database.Database,
  id: string
): void {
  // exchanges are removed automatically via ON DELETE CASCADE
  db.prepare(`DELETE FROM conversations WHERE id = ?`).run(id);
}

export function getConversation(
  db: Database.Database,
  id: string
): (Conversation & { hash: string }) | undefined {
  const stmt = db.prepare(`
    SELECT * FROM conversations WHERE id = ?
  `);

  const row = stmt.get(id) as any;
  if (!row) return undefined;

  return {
    id: row.id,
    source: row.source,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    archivePath: row.archive_path,
    exchangeCount: row.exchange_count,
    hash: row.hash,
    lastIndexed: row.last_indexed,
    copilotVersion: row.copilot_version,
    cwd: row.cwd,
  };
}

export function getExchanges(
  db: Database.Database,
  conversationId: string
): Exchange[] {
  const stmt = db.prepare(`
    SELECT * FROM exchanges WHERE conversation_id = ? ORDER BY exchange_index
  `);

  const rows = stmt.all(conversationId) as any[];

  return rows.map(row => ({
    id: row.id,
    conversationId: row.conversation_id,
    exchangeIndex: row.exchange_index,
    timestamp: row.timestamp,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
    parentId: row.parent_id,
  }));
}

async function generateExchangeEmbeddings(
  exchanges: Exchange[],
  embedder: Embedder
): Promise<void> {
  await embedder.init();

  for (const exchange of exchanges) {
    // Combine user message and assistant message for embedding
    const text = formatExchangeForEmbedding(exchange);
    const embedding = await embedder.generateEmbedding(text);
    (exchange as any)._embedding = embedding;
  }
}

function formatExchangeForEmbedding(exchange: Exchange): string {
  let text = `User: ${exchange.userMessage}\n\nAssistant: ${exchange.assistantMessage}`;

  // Include tool names for better semantic context
  if (exchange.toolCalls && exchange.toolCalls.length > 0) {
    text += `\n\nTools used: ${exchange.toolCalls.join(', ')}`;
  }

  return text;
}

function insertExchangeEmbedding(
  db: Database.Database,
  exchangeId: string,
  embedding: number[]
): void {
  const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

  const stmt = db.prepare(`
    UPDATE exchanges
    SET embedding = ?
    WHERE id = ?
  `);

  stmt.run(embeddingBuffer, exchangeId);
}

function deleteExchangesForConversation(
  db: Database.Database,
  conversationId: string
): void {
  const stmt = db.prepare(`
    DELETE FROM exchanges WHERE conversation_id = ?
  `);

  stmt.run(conversationId);
}
