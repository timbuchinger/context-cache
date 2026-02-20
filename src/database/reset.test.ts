import Database from 'better-sqlite3';
import { resetDatabase } from './reset';
import { initDatabase } from '../database/init';
import { insertFile, insertChunkWithEmbedding } from '../database/operations';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Reset Database', () => {
  let testDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
    
    // Add some test data
    const fileId = insertFile(db, 'test/file.md', 'abc123');
    const embedding = Buffer.from(new Float32Array(384).buffer);
    const chunkId = insertChunkWithEmbedding(db, fileId, 0, 'Test content', 'Test content', embedding);
    
    // Populate FTS table
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunkId, 'Test content');
  });

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('deletes all files from database', () => {
    // Verify data exists
    let fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    expect(fileCount.count).toBeGreaterThan(0);

    // Reset
    resetDatabase(db);

    // Verify data deleted
    fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    expect(fileCount.count).toBe(0);
  });

  test('deletes all chunks from database', () => {
    // Verify data exists
    let chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    expect(chunkCount.count).toBeGreaterThan(0);

    // Reset
    resetDatabase(db);

    // Verify data deleted
    chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    expect(chunkCount.count).toBe(0);
  });

  test('clears FTS5 table', () => {
    // Verify FTS data exists
    let ftsCount = db.prepare('SELECT COUNT(*) as count FROM chunks_fts').get() as { count: number };
    expect(ftsCount.count).toBeGreaterThan(0);

    // Reset
    resetDatabase(db);

    // Verify FTS cleared
    ftsCount = db.prepare('SELECT COUNT(*) as count FROM chunks_fts').get() as { count: number };
    expect(ftsCount.count).toBe(0);
  });

  test('maintains database structure after reset', () => {
    resetDatabase(db);

    // Verify tables still exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('files');
    expect(tableNames).toContain('chunks');
    expect(tableNames).toContain('chunks_fts');
  });

  test('allows inserting data after reset', () => {
    resetDatabase(db);

    // Should be able to insert new data
    const fileId = insertFile(db, 'new/file.md', 'xyz789');
    expect(fileId).toBeGreaterThan(0);

    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    expect(fileCount.count).toBe(1);
  });
});
