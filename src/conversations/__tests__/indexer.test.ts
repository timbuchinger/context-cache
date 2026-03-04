/**
 * Tests for conversation indexer
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../database/init';
import {
  indexConversationFile,
  indexConversationFiles,
  getConversation,
  getExchanges,
  repairFtsIndex,
} from '../indexer';
import { Embedder } from '../../indexer/embedder';

// Mock embedder that fails for testing error handling
class FailingEmbedder implements Embedder {
  async generateEmbedding(text: string): Promise<number[]> {
    throw new Error('Ollama embedding failed: Bad Request');
  }
}

describe('Conversation Indexer', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-conv-idx-${Date.now()}.db`);
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-idx-test-'));
    db = initDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestConversation(filename: string, sessionId: string) {
    const testFile = path.join(testDir, filename);
    const content = [
      JSON.stringify({
        type: 'session.start',
        data: {
          sessionId,
          version: 1,
          producer: 'copilot-agent',
          copilotVersion: '0.0.400',
          startTime: '2026-02-18T10:00:00Z',
        },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Test question' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Test answer' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);
    return testFile;
  }

  test('indexes single conversation file', async () => {
    const sessionId = 'test-session-1';
    const testFile = createTestConversation('conv1.jsonl', sessionId);

    await indexConversationFile(db, testFile);

    const conversation = getConversation(db, sessionId);
    expect(conversation).toBeDefined();
    expect(conversation!.sessionId).toBe(sessionId);
    expect(conversation!.source).toBe('copilot');
    expect(conversation!.exchangeCount).toBe(1);

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
    expect(exchanges[0].userMessage).toBe('Test question');
    expect(exchanges[0].assistantMessage).toBe('Test answer');
  });

  test('indexes multiple conversation files', async () => {
    const file1 = createTestConversation('conv1.jsonl', 'session-1');
    const file2 = createTestConversation('conv2.jsonl', 'session-2');

    const result = await indexConversationFiles(db, [file1, file2]);

    expect(result.conversationsIndexed).toBe(2);
    expect(result.exchangesIndexed).toBe(2);
    expect(result.errors.length).toBe(0);

    const conv1 = getConversation(db, 'session-1');
    const conv2 = getConversation(db, 'session-2');
    expect(conv1).toBeDefined();
    expect(conv2).toBeDefined();
  });

  test('handles duplicate insertions', async () => {
    const sessionId = 'test-session-dup';
    const testFile = createTestConversation('conv-dup.jsonl', sessionId);

    await indexConversationFile(db, testFile);
    await indexConversationFile(db, testFile);

    const conversation = getConversation(db, sessionId);
    expect(conversation).toBeDefined();

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
  });

  test('handles indexing errors gracefully', async () => {
    const invalidFile = path.join(testDir, 'invalid.jsonl');
    fs.writeFileSync(invalidFile, 'not valid json');

    const result = await indexConversationFiles(db, [invalidFile]);

    expect(result.conversationsIndexed).toBe(0);
    expect(result.exchangesIndexed).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  test('returns exchanges in correct order', async () => {
    const testFile = path.join(testDir, 'multi-exchange.jsonl');
    const sessionId = 'multi-session';

    const content = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);
    await indexConversationFile(db, testFile);

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(2);
    expect(exchanges[0].exchangeIndex).toBe(0);
    expect(exchanges[0].userMessage).toBe('First');
    expect(exchanges[1].exchangeIndex).toBe(1);
    expect(exchanges[1].userMessage).toBe('Second');
  });

  test('updates conversation correctly when re-indexed', async () => {
    const testFile = path.join(testDir, 'update-test.jsonl');
    const sessionId = 'update-session';

    // Initial conversation with 2 exchanges
    const initialContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, initialContent);
    await indexConversationFile(db, testFile);

    let exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(2);

    // Updated conversation with 3 exchanges (conversation continued)
    const updatedContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Third' },
        id: 'e6',
        timestamp: '2026-02-18T10:00:25Z',
        parentId: 'e5',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Third response' },
        id: 'e7',
        timestamp: '2026-02-18T10:00:30Z',
        parentId: 'e6',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, updatedContent);
    await indexConversationFile(db, testFile);

    exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(3);
    expect(exchanges[2].userMessage).toBe('Third');

    const conversation = getConversation(db, sessionId);
    expect(conversation!.exchangeCount).toBe(3);
  });

  test('removes conversations from DB when archive files are deleted', async () => {
    const file1 = createTestConversation('conv-del-1.jsonl', 'session-del-1');
    const file2 = createTestConversation('conv-del-2.jsonl', 'session-del-2');

    // Index both files
    await indexConversationFiles(db, [file1, file2]);
    expect(getConversation(db, 'session-del-1')).toBeDefined();
    expect(getConversation(db, 'session-del-2')).toBeDefined();

    // Delete file1 from disk
    fs.unlinkSync(file1);

    // Re-index with only file2 — file1's conversation should be pruned from DB
    const result = await indexConversationFiles(db, [file2]);
    expect(result.conversationsDeleted).toBe(1);
    expect(getConversation(db, 'session-del-1')).toBeUndefined();
    expect(getConversation(db, 'session-del-2')).toBeDefined();
  });

  test('cleans up orphaned exchanges when conversation shrinks', async () => {
    const testFile = path.join(testDir, 'shrink-test.jsonl');
    const sessionId = 'shrink-session';

    // Initial conversation with 3 exchanges
    const initialContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Third' },
        id: 'e6',
        timestamp: '2026-02-18T10:00:25Z',
        parentId: 'e5',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Third response' },
        id: 'e7',
        timestamp: '2026-02-18T10:00:30Z',
        parentId: 'e6',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, initialContent);
    await indexConversationFile(db, testFile);

    let exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(3);

    // Updated conversation with only 1 exchange (maybe file was corrupted or truncated)
    const updatedContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Only one' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Only response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, updatedContent);
    await indexConversationFile(db, testFile);

    exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
    expect(exchanges[0].userMessage).toBe('Only one');

    const conversation = getConversation(db, sessionId);
    expect(conversation!.exchangeCount).toBe(1);
  });

  test('continues indexing exchanges when embedding fails', async () => {
    const sessionId = 'test-session-embedfail';
    const testFile = path.join(testDir, 'embedfail.jsonl');
    const content = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, version: 1, producer: 'copilot-agent' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First question' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First answer' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second question' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second answer' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    // Index with failing embedder - should still index exchanges
    const failingEmbedder = new FailingEmbedder();
    await indexConversationFile(db, testFile, { embedder: failingEmbedder });

    // Verify conversation is indexed
    const conversation = getConversation(db, sessionId);
    expect(conversation).toBeDefined();
    expect(conversation!.exchangeCount).toBe(2); // 2 user-assistant pairs

    // Verify exchanges are stored even though embeddings failed
    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(2);

    // Verify exchanges have NULL embeddings
    const rows = db.prepare('SELECT embedding FROM exchanges WHERE conversation_id = ?').all(sessionId) as { embedding: Buffer | null }[];
    expect(rows.length).toBe(2);
    rows.forEach(row => {
      expect(row.embedding).toBeNull();
    });
  });

  test('conversation searches work with NULL embeddings via BM25', async () => {
    const sessionId = 'test-session-bm25-only';
    const testFile = path.join(testDir, 'bm25.jsonl');
    const content = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, version: 1, producer: 'copilot-agent' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'How do I use TypeScript?' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'TypeScript is a typed language' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    // Index with failing embedder
    const failingEmbedder = new FailingEmbedder();
    await indexConversationFile(db, testFile, { embedder: failingEmbedder });

    // Verify FTS5 contains the exchange content
    const ftsResult = db.prepare(
      "SELECT COUNT(*) as count FROM exchanges_fts WHERE user_message MATCH 'TypeScript'"
    ).get() as { count: number };

    expect(ftsResult.count).toBeGreaterThan(0);
  });

  test('repairFtsIndex backfills FTS from exchanges when FTS is empty', async () => {
    // 1. Index a conversation normally so exchanges exist
    const testFile = createTestConversation('repair-test.jsonl', 'repair-session-1');
    await indexConversationFile(db, testFile);

    // 2. Verify exchanges were indexed
    const exchangeCount = (db.prepare('SELECT COUNT(*) as cnt FROM exchanges').get() as { cnt: number }).cnt;
    expect(exchangeCount).toBeGreaterThan(0);

    // 3. Manually empty the FTS table to simulate the inconsistency
    db.prepare('DELETE FROM exchanges_fts').run();
    const ftsCountBefore = (db.prepare('SELECT COUNT(*) as cnt FROM exchanges_fts').get() as { cnt: number }).cnt;
    expect(ftsCountBefore).toBe(0);

    // 4. Repair should backfill FTS from existing exchanges
    const repairedCount = repairFtsIndex(db);
    expect(repairedCount).toBe(exchangeCount);

    // 5. BM25 search should now work
    const ftsCountAfter = (db.prepare('SELECT COUNT(*) as cnt FROM exchanges_fts').get() as { cnt: number }).cnt;
    expect(ftsCountAfter).toBe(exchangeCount);
  });

  test('repairFtsIndex returns 0 when FTS is already consistent', async () => {
    const testFile = createTestConversation('no-repair-needed.jsonl', 'repair-session-2');
    await indexConversationFile(db, testFile);

    // FTS should already be populated - repairFtsIndex should do nothing
    const repairedCount = repairFtsIndex(db);
    expect(repairedCount).toBe(0);
  });
});
