/**
 * Tests for conversation search with BM25 scoring
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../database/init';
import { insertExchange, insertConversation } from '../indexer';
import { searchConversations } from '../search';
import { Exchange, Conversation } from '../types';

describe('Conversation Search', () => {
  let db: Database.Database;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-conv-search-${Date.now()}.db`);
    db = initDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  });

  function makeConversation(id: string, sessionId: string): Conversation {
    return {
      id,
      source: 'copilot',
      sessionId,
      timestamp: '2026-01-01T00:00:00Z',
      archivePath: `/tmp/${id}.jsonl`,
      exchangeCount: 1,
      lastIndexed: Date.now(),
    };
  }

  function makeExchange(
    id: string,
    conversationId: string,
    index: number,
    user: string,
    assistant: string
  ): Exchange {
    return {
      id,
      conversationId,
      exchangeIndex: index,
      timestamp: '2026-01-01T00:00:00Z',
      userMessage: user,
      assistantMessage: assistant,
    };
  }

  test('returns empty array when no conversations match', async () => {
    const results = await searchConversations(db, 'nonexistent query');
    expect(results).toEqual([]);
  });

  test('returns matching exchanges with BM25 score greater than zero', async () => {
    const conv = makeConversation('conv-1', 'session-1');
    insertConversation(db, conv, 'hash1');
    insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'How does TypeScript work?', 'TypeScript is a typed superset of JavaScript'));

    const results = await searchConversations(db, 'TypeScript');
    expect(results.length).toBe(1);
    expect(results[0].score).toBeGreaterThan(0);
  });

  test('does not return all results with score 1.0', async () => {
    const conv = makeConversation('conv-1', 'session-1');
    insertConversation(db, conv, 'hash1');

    // Insert multiple exchanges, some with the query term, some without
    insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'TypeScript TypeScript TypeScript types', 'TypeScript TypeScript TypeScript advanced types'));
    insertExchange(db, makeExchange('ex-2', 'conv-1', 1, 'What is TypeScript?', 'A typed language'));

    const results = await searchConversations(db, 'TypeScript');
    expect(results.length).toBe(2);

    // Scores should NOT all be 1.0
    const allOnes = results.every(r => r.score === 1.0);
    expect(allOnes).toBe(false);
  });

  test('orders results by relevance - higher score first', async () => {
    const conv = makeConversation('conv-1', 'session-1');
    insertConversation(db, conv, 'hash1');

    // ex-1 has the query term many times (more relevant)
    insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'database database database query optimization', 'database database database indexing'));
    // ex-2 mentions the term once
    insertExchange(db, makeExchange('ex-2', 'conv-1', 1, 'What is a database?', 'A storage system'));

    const results = await searchConversations(db, 'database');
    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  test('scores differ between queries with different relevance', async () => {
    const conv1 = makeConversation('conv-1', 'session-1');
    const conv2 = makeConversation('conv-2', 'session-2');
    insertConversation(db, conv1, 'hash1');
    insertConversation(db, conv2, 'hash2');

    // conv-1 is heavily about "embedding"
    insertExchange(db, makeExchange('ex-1', 'conv-1', 0,
      'How do embeddings work? embedding embedding embedding vector embedding',
      'Embeddings are dense vector representations. embedding embedding'
    ));

    // conv-2 mentions it once in passing
    insertExchange(db, makeExchange('ex-2', 'conv-2', 0,
      'What is machine learning?',
      'Machine learning involves embedding representations among other things'
    ));

    const results = await searchConversations(db, 'embedding');
    expect(results.length).toBe(2);

    // The first result should have a higher score
    expect(results[0].score).toBeGreaterThan(results[1].score);
    // The top result should be ex-1 (more occurrences)
    expect(results[0].exchangeId).toBe('ex-1');
  });

  test('returns correct fields in results', async () => {
    const conv = makeConversation('conv-1', 'session-1');
    insertConversation(db, conv, 'hash1');
    insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'test question', 'test answer'));

    const results = await searchConversations(db, 'test');
    expect(results.length).toBe(1);
    expect(results[0]).toMatchObject({
      conversationId: 'conv-1',
      sessionId: 'session-1',
      source: 'copilot',
      exchangeId: 'ex-1',
      userMessage: 'test question',
      assistantMessage: 'test answer',
    });
    expect(typeof results[0].score).toBe('number');
  });

  describe('hybrid search (BM25 + vector)', () => {
    function insertEmbedding(db: Database.Database, exchangeId: string, embedding: number[]): void {
      const buf = Buffer.from(new Float32Array(embedding).buffer);
      db.prepare('UPDATE exchanges SET embedding = ? WHERE id = ?').run(buf, exchangeId);
    }

    function makeEmbedding(hotDimension: number): number[] {
      // 384-d embedding with 1.0 at one dimension, 0 elsewhere
      return new Array(384).fill(0).map((_, i) => i === hotDimension ? 1.0 : 0.0);
    }

    test('returns BM25 results when no queryEmbedding provided', async () => {
      const conv = makeConversation('conv-1', 'session-1');
      insertConversation(db, conv, 'hash1');
      insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'TypeScript types', 'TypeScript answer'));

      const results = await searchConversations(db, 'TypeScript');
      expect(results.length).toBe(1);
      expect(results[0].exchangeId).toBe('ex-1');
    });

    test('includes semantically matching exchange when queryEmbedding is provided', async () => {
      const conv = makeConversation('conv-1', 'session-1');
      insertConversation(db, conv, 'hash1');

      // ex-1: keyword match but no embedding
      insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'database query', 'database answer'));

      // ex-2: no keyword match but semantically very similar (same hot dimension)
      insertExchange(db, makeExchange('ex-2', 'conv-1', 1, 'completely different words here', 'unrelated text'));
      insertEmbedding(db, 'ex-2', makeEmbedding(5));

      const queryEmbedding = makeEmbedding(5); // same dimension as ex-2
      const results = await searchConversations(db, 'database', { queryEmbedding });

      // ex-2 should appear because vector search finds it, even though BM25 would miss it
      const ids = results.map(r => r.exchangeId);
      expect(ids).toContain('ex-2');
    });

    test('exchange in both BM25 and vector results ranks highest', async () => {
      const conv = makeConversation('conv-1', 'session-1');
      insertConversation(db, conv, 'hash1');

      // ex-1: keyword match AND semantic match
      insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'embedding vector search', 'embedding vector answer'));
      insertEmbedding(db, 'ex-1', makeEmbedding(10));

      // ex-2: keyword match only
      insertExchange(db, makeExchange('ex-2', 'conv-1', 1, 'embedding keyword', 'embedding text'));

      // ex-3: vector match only (different hot dimension from query to avoid collision)
      insertExchange(db, makeExchange('ex-3', 'conv-1', 2, 'unrelated words here', 'no match'));
      insertEmbedding(db, 'ex-3', makeEmbedding(20));

      const queryEmbedding = makeEmbedding(10); // matches ex-1 exactly
      const results = await searchConversations(db, 'embedding', { queryEmbedding });

      expect(results.length).toBeGreaterThan(0);
      // ex-1 appears in both lists, should be ranked first
      expect(results[0].exchangeId).toBe('ex-1');
    });

    test('scores are normalized to 0-1 range when queryEmbedding provided', async () => {
      const conv = makeConversation('conv-1', 'session-1');
      insertConversation(db, conv, 'hash1');
      insertExchange(db, makeExchange('ex-1', 'conv-1', 0, 'test phrase here', 'test answer here'));
      insertEmbedding(db, 'ex-1', makeEmbedding(7));

      const queryEmbedding = makeEmbedding(7);
      const results = await searchConversations(db, 'test', { queryEmbedding });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].score).toBeLessThanOrEqual(1.0);
    });
  });
});
