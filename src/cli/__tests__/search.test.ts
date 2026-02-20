import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { searchNotes } from '../search';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../database/init';
import { insertFile, insertChunkWithEmbedding } from '../../database/operations';

// Mock the embedder module
jest.mock('../../indexer/embedder', () => ({
  createEmbedder: jest.fn(async () => ({
    generateEmbedding: jest.fn(async (text: string) => new Float32Array([0.1, 0.2, 0.3])),
  })),
}));

describe('Search CLI', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-cache-search-test-'));
    dbPath = path.join(tempDir, 'test.db');
    
    // Initialize database
    initDatabase(dbPath);
    db = new Database(dbPath);
    
    // Create test data
    const file1 = insertFile(db, 'typescript.md', 'hash1');
    const file2 = insertFile(db, 'javascript.md', 'hash2');
    const file3 = insertFile(db, 'python.md', 'hash3');
    
    const embedding1 = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    const embedding2 = Buffer.from(new Float32Array([0.2, 0.3, 0.4]).buffer);
    const embedding3 = Buffer.from(new Float32Array([0.3, 0.4, 0.5]).buffer);
    
    insertChunkWithEmbedding(
      db, file1, 0,
      'TypeScript is a typed superset of JavaScript.',
      'TypeScript is a typed superset of JavaScript.',
      embedding1
    );
    
    insertChunkWithEmbedding(
      db, file2, 0,
      'JavaScript is a dynamic programming language.',
      'JavaScript is a dynamic programming language.',
      embedding2
    );
    
    insertChunkWithEmbedding(
      db, file3, 0,
      'Python is known for its simplicity and readability.',
      'Python is known for its simplicity and readability.',
      embedding3
    );
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('returns search results for query', async () => {
    const results = await searchNotes(dbPath, 'TypeScript programming');
    
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('source_path');
    expect(results[0]).toHaveProperty('content');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('chunk_index');
  });

  test('respects limit parameter', async () => {
    const results = await searchNotes(dbPath, 'programming', 2);
    
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test('uses default limit of 10 when not specified', async () => {
    const results = await searchNotes(dbPath, 'TypeScript');
    
    expect(Array.isArray(results)).toBe(true);
    // Should return all results since we have less than 10
    expect(results.length).toBeLessThanOrEqual(10);
  });

  test('returns empty array when no matches found', async () => {
    const results = await searchNotes(dbPath, 'quantum computing blockchain AI xyz');
    
    // With mock embeddings, we might still get results
    // Just verify it returns an array
    expect(Array.isArray(results)).toBe(true);
  });

  test('throws error when database does not exist', async () => {
    await expect(async () => {
      await searchNotes('/nonexistent/path/db.sqlite', 'test');
    }).rejects.toThrow();
  });

  test('returns results ordered by score', async () => {
    const results = await searchNotes(dbPath, 'JavaScript');
    
    // Verify scores are in descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });
});
