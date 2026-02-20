import { indexFiles, IndexStats } from './index';
import { initDatabase } from '../database/init';
import { getFileByPath } from '../database/operations';
import { Embedder } from './embedder';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock embedder for testing
class MockEmbedder implements Embedder {
  async init() {}
  
  async generateEmbedding(text: string): Promise<number[]> {
    return new Array(384).fill(0).map((_, i) => Math.sin(i + text.length) * 0.5);
  }
}

describe('Indexer', () => {
  let testDbPath: string;
  let testKbPath: string;
  let db: Database.Database;
  let embedder: Embedder;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-db-${Date.now()}.db`);
    testKbPath = path.join(os.tmpdir(), `test-kb-${Date.now()}`);
    
    db = initDatabase(testDbPath);
    embedder = new MockEmbedder();
    
    // Create test knowledge base directory
    fs.mkdirSync(testKbPath, { recursive: true });
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testKbPath)) {
      fs.rmSync(testKbPath, { recursive: true, force: true });
    }
  });

  test('indexes new markdown file', async () => {
    // Create a test markdown file
    const testFile = path.join(testKbPath, 'test.md');
    fs.writeFileSync(testFile, '# Test\n\nThis is test content for indexing.');

    const stats = await indexFiles(db, testKbPath, embedder);

    expect(stats.filesProcessed).toBe(1);
    expect(stats.filesAdded).toBe(1);
    expect(stats.filesUpdated).toBe(0);
    expect(stats.filesSkipped).toBe(0);
    expect(stats.chunksCreated).toBeGreaterThan(0);

    // Verify file is in database
    const fileRecord = getFileByPath(db, 'test.md');
    expect(fileRecord).toBeDefined();
    expect(fileRecord?.path).toBe('test.md');
  });

  test('skips unchanged files on second run', async () => {
    const testFile = path.join(testKbPath, 'test.md');
    fs.writeFileSync(testFile, '# Test\n\nContent here.');

    // First run - should index
    const stats1 = await indexFiles(db, testKbPath, embedder);
    expect(stats1.filesAdded).toBe(1);

    // Second run - should skip (hash unchanged)
    const stats2 = await indexFiles(db, testKbPath, embedder);
    expect(stats2.filesProcessed).toBe(1);
    expect(stats2.filesSkipped).toBe(1);
    expect(stats2.filesAdded).toBe(0);
    expect(stats2.filesUpdated).toBe(0);
  });

  test('updates file when content changes', async () => {
    const testFile = path.join(testKbPath, 'test.md');
    fs.writeFileSync(testFile, '# Original content');

    // First index
    await indexFiles(db, testKbPath, embedder);

    // Modify file
    fs.writeFileSync(testFile, '# Modified content');

    // Re-index - should detect change
    const stats = await indexFiles(db, testKbPath, embedder);
    expect(stats.filesProcessed).toBe(1);
    expect(stats.filesUpdated).toBe(1);
    expect(stats.filesSkipped).toBe(0);
  });

  test('creates chunks for file content', async () => {
    const testFile = path.join(testKbPath, 'test.md');
    const longContent = 'Test content. '.repeat(100); // Force multiple chunks
    fs.writeFileSync(testFile, longContent);

    const stats = await indexFiles(db, testKbPath, embedder);

    expect(stats.chunksCreated).toBeGreaterThan(1);
  });

  test('populates FTS5 table for search', async () => {
    const testFile = path.join(testKbPath, 'searchable.md');
    fs.writeFileSync(testFile, 'TypeScript is a programming language');

    await indexFiles(db, testKbPath, embedder);

    // Verify FTS5 contains the content
    const ftsResult = db.prepare(
      "SELECT COUNT(*) as count FROM chunks_fts WHERE content MATCH 'TypeScript'"
    ).get() as { count: number };

    expect(ftsResult.count).toBeGreaterThan(0);
  });

  test('indexes multiple files', async () => {
    fs.writeFileSync(path.join(testKbPath, 'file1.md'), 'Content 1');
    fs.writeFileSync(path.join(testKbPath, 'file2.md'), 'Content 2');
    fs.writeFileSync(path.join(testKbPath, 'file3.md'), 'Content 3');

    const stats = await indexFiles(db, testKbPath, embedder);

    expect(stats.filesProcessed).toBe(3);
    expect(stats.filesAdded).toBe(3);
  });

  test('ignores non-markdown files', async () => {
    fs.writeFileSync(path.join(testKbPath, 'test.md'), 'Markdown');
    fs.writeFileSync(path.join(testKbPath, 'test.txt'), 'Text file');
    fs.writeFileSync(path.join(testKbPath, 'test.js'), 'JavaScript');

    const stats = await indexFiles(db, testKbPath, embedder);

    expect(stats.filesProcessed).toBe(1); // Only .md file
  });

  test('handles nested directories', async () => {
    const subdir = path.join(testKbPath, 'subdir');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(testKbPath, 'root.md'), 'Root');
    fs.writeFileSync(path.join(subdir, 'nested.md'), 'Nested');

    const stats = await indexFiles(db, testKbPath, embedder);

    expect(stats.filesProcessed).toBe(2);
  });

  test('removes deleted files from database', async () => {
    // Create and index a file
    const testFile = path.join(testKbPath, 'to-delete.md');
    fs.writeFileSync(testFile, '# Will be deleted\n\nThis file will be removed.');
    
    const stats1 = await indexFiles(db, testKbPath, embedder);
    expect(stats1.filesAdded).toBe(1);
    
    // Verify file is in database
    const fileInDb = getFileByPath(db, 'to-delete.md');
    expect(fileInDb).toBeDefined();
    expect(fileInDb?.path).toBe('to-delete.md');
    
    // Delete the file from disk
    fs.unlinkSync(testFile);
    
    // Re-index
    const stats2 = await indexFiles(db, testKbPath, embedder);
    
    // File should be removed from database
    const fileAfter = getFileByPath(db, 'to-delete.md');
    expect(fileAfter).toBeUndefined();
    
    // Stats should show deletion
    expect(stats2.filesDeleted).toBe(1);
  });

  test('removes deleted files but keeps existing ones', async () => {
    // Create two files
    const keepFile = path.join(testKbPath, 'keep.md');
    const deleteFile = path.join(testKbPath, 'delete.md');
    
    fs.writeFileSync(keepFile, '# Keep this\n\nStay in database.');
    fs.writeFileSync(deleteFile, '# Delete this\n\nWill be removed.');
    
    // Index both
    const stats1 = await indexFiles(db, testKbPath, embedder);
    expect(stats1.filesAdded).toBe(2);
    
    // Delete one file
    fs.unlinkSync(deleteFile);
    
    // Re-index
    const stats2 = await indexFiles(db, testKbPath, embedder);
    
    // Verify correct file was removed
    expect(getFileByPath(db, 'delete.md')).toBeUndefined();
    expect(getFileByPath(db, 'keep.md')).toBeDefined();
    expect(stats2.filesDeleted).toBe(1);
    expect(stats2.filesSkipped).toBe(1); // keep.md unchanged
  });
});
