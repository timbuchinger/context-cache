import Database from 'better-sqlite3';
import { initDatabase } from '../database/init';
import { insertFile, insertChunk } from '../database/operations';
import { bm25Search } from './bm25';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BM25 Search', () => {
  let testDbPath: string;
  let db: Database.Database;
  let fileId: number;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
    fileId = insertFile(db, 'test/file.md', 'abc123');

    // Insert test chunks
    const chunk1Id = insertChunk(db, fileId, 0, 'TypeScript is a programming language', 'TypeScript is a programming language', null);
    const chunk2Id = insertChunk(db, fileId, 1, 'JavaScript is also a programming language', 'JavaScript is also a programming language', null);
    const chunk3Id = insertChunk(db, fileId, 2, 'Python is great for data science', 'Python is great for data science', null);

    // Populate FTS table
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk1Id, 'TypeScript is a programming language');
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk2Id, 'JavaScript is also a programming language');
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunk3Id, 'Python is great for data science');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('finds relevant chunks with BM25 scoring', () => {
    const results = bm25Search(db, 'TypeScript programming', 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk_id).toBeDefined();
    expect(results[0].score).toBeDefined();
    expect(results[0].content).toContain('TypeScript');
  });

  test('returns results ordered by relevance', () => {
    const results = bm25Search(db, 'programming', 10);

    expect(results.length).toBeGreaterThanOrEqual(2);
    // In FTS5 BM25, lower scores are better (DESC order gives best first)
    // Just verify we got ordered results
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i + 1].score);
    }
  });

  test('limits number of results', () => {
    const results = bm25Search(db, 'programming', 1);

    expect(results).toHaveLength(1);
  });
});
