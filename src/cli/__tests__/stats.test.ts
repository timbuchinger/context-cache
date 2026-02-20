import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { getIndexStats } from '../stats';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../database/init';
import { insertFile, insertChunkWithEmbedding } from '../../database/operations';

describe('Index Statistics', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-cache-stats-test-'));
    dbPath = path.join(tempDir, 'test.db');
    
    // Initialize database
    initDatabase(dbPath);
    db = new Database(dbPath);
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('returns zero stats for empty database', () => {
    const stats = getIndexStats(dbPath);
    
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalChunks).toBe(0);
    expect(stats.avgChunksPerFile).toBe(0);
    expect(stats.databaseSizeBytes).toBeGreaterThan(0); // Database file exists
  });

  test('counts single file with one chunk', () => {
    const fileId = insertFile(db, 'test.md', 'abc123');
    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    insertChunkWithEmbedding(db, fileId, 0, 'Test content', 'Test content', embedding);

    const stats = getIndexStats(dbPath);
    
    expect(stats.totalFiles).toBe(1);
    expect(stats.totalChunks).toBe(1);
    expect(stats.avgChunksPerFile).toBe(1);
  });

  test('counts multiple files with multiple chunks', () => {
    const file1 = insertFile(db, 'file1.md', 'hash1');
    const file2 = insertFile(db, 'file2.md', 'hash2');
    const file3 = insertFile(db, 'file3.md', 'hash3');
    
    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    
    // File 1: 2 chunks
    insertChunkWithEmbedding(db, file1, 0, 'Content 1a', 'Content 1a', embedding);
    insertChunkWithEmbedding(db, file1, 1, 'Content 1b', 'Content 1b', embedding);
    
    // File 2: 3 chunks
    insertChunkWithEmbedding(db, file2, 0, 'Content 2a', 'Content 2a', embedding);
    insertChunkWithEmbedding(db, file2, 1, 'Content 2b', 'Content 2b', embedding);
    insertChunkWithEmbedding(db, file2, 2, 'Content 2c', 'Content 2c', embedding);
    
    // File 3: 1 chunk
    insertChunkWithEmbedding(db, file3, 0, 'Content 3', 'Content 3', embedding);

    const stats = getIndexStats(dbPath);
    
    expect(stats.totalFiles).toBe(3);
    expect(stats.totalChunks).toBe(6);
    expect(stats.avgChunksPerFile).toBe(2); // 6 / 3 = 2
  });

  test('calculates average chunks per file with precision', () => {
    const file1 = insertFile(db, 'file1.md', 'hash1');
    const file2 = insertFile(db, 'file2.md', 'hash2');
    
    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    
    // File 1: 1 chunk
    insertChunkWithEmbedding(db, file1, 0, 'Content 1', 'Content 1', embedding);
    
    // File 2: 2 chunks
    insertChunkWithEmbedding(db, file2, 0, 'Content 2a', 'Content 2a', embedding);
    insertChunkWithEmbedding(db, file2, 1, 'Content 2b', 'Content 2b', embedding);

    const stats = getIndexStats(dbPath);
    
    expect(stats.totalFiles).toBe(2);
    expect(stats.totalChunks).toBe(3);
    expect(stats.avgChunksPerFile).toBe(1.5); // 3 / 2 = 1.5
  });

  test('returns file paths list when requested', () => {
    insertFile(db, 'docs/api.md', 'hash1');
    insertFile(db, 'docs/guide.md', 'hash2');
    insertFile(db, 'README.md', 'hash3');

    const stats = getIndexStats(dbPath, { includeFiles: true });
    
    expect(stats.files).toBeDefined();
    expect(stats.files).toHaveLength(3);
    expect(stats.files).toContain('docs/api.md');
    expect(stats.files).toContain('docs/guide.md');
    expect(stats.files).toContain('README.md');
  });

  test('does not include file paths by default', () => {
    insertFile(db, 'test.md', 'hash1');

    const stats = getIndexStats(dbPath);
    
    expect(stats.files).toBeUndefined();
  });

  test('handles database that does not exist', () => {
    expect(() => {
      getIndexStats('/nonexistent/path/db.sqlite');
    }).toThrow();
  });
});
