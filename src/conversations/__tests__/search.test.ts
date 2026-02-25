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
});
