import Database from 'better-sqlite3';
import { initDatabase } from '../database/init';
import { insertFile, insertChunkWithEmbedding } from '../database/operations';
import { hybridSearch } from './hybrid';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Hybrid Search', () => {
  let testDbPath: string;
  let db: Database.Database;
  let fileId: number;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
    fileId = insertFile(db, 'test/typescript.md', 'abc123');

    // Insert chunks with both text content and embeddings
    const chunk1Text = 'TypeScript is a strongly typed programming language';
    const chunk2Text = 'JavaScript is a dynamic programming language';
    const chunk3Text = 'Python is great for data science and machine learning';

    // Create embeddings (simplified for testing)
    const embedding1 = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    const embedding2 = new Array(384).fill(0).map((_, i) => i >= 10 && i < 20 ? 1.0 : 0.0);
    const embedding3 = new Array(384).fill(0).map((_, i) => i >= 20 && i < 30 ? 1.0 : 0.0);

    const chunk1Id = insertChunkWithEmbedding(
      db, fileId, 0, chunk1Text, chunk1Text, 
      Buffer.from(new Float32Array(embedding1).buffer)
    );
    const chunk2Id = insertChunkWithEmbedding(
      db, fileId, 1, chunk2Text, chunk2Text, 
      Buffer.from(new Float32Array(embedding2).buffer)
    );
    const chunk3Id = insertChunkWithEmbedding(
      db, fileId, 2, chunk3Text, chunk3Text, 
      Buffer.from(new Float32Array(embedding3).buffer)
    );

    // Populate FTS table for BM25
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk1Id, chunk1Text);
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk2Id, chunk2Text);
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk3Id, chunk3Text);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('combines BM25 and vector search results', async () => {
    // Query that should match TypeScript in text and has similar embedding
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 0.9 : 0.0);
    
    const results = await hybridSearch(db, 'TypeScript programming', queryEmbedding, 10);

    expect(results).toBeDefined();
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('content');
    expect(results[0]).toHaveProperty('source_path');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('chunk_index');
  });

  test('returns results with source file path', async () => {
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    
    const results = await hybridSearch(db, 'TypeScript', queryEmbedding, 10);

    expect(results[0].source_path).toBe('test/typescript.md');
  });

  test('ranks items appearing in both BM25 and vector results higher', async () => {
    // Query that should match TypeScript in both text and embedding
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    
    const results = await hybridSearch(db, 'TypeScript', queryEmbedding, 10);

    // The TypeScript chunk should be ranked first (appears in both searches)
    expect(results[0].content).toContain('TypeScript');
  });

  test('respects result limit', async () => {
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    
    const results = await hybridSearch(db, 'programming', queryEmbedding, 2);

    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('normalizes scores to 0-1 range', async () => {
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    
    const results = await hybridSearch(db, 'TypeScript programming', queryEmbedding, 10);

    // Best result should have score close to 1.0
    expect(results[0].score).toBeGreaterThan(0.8);
    expect(results[0].score).toBeLessThanOrEqual(1.0);
    
    // All scores should be in 0-1 range
    results.forEach(result => {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1.0);
    });
    
    // Scores should be in descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});
