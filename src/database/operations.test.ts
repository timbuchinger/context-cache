import Database from 'better-sqlite3';
import { initDatabase } from './init';
import { 
  insertFile, 
  getFileByPath, 
  updateFileHash, 
  deleteFile,
  insertChunk,
  getChunksByFileId,
  deleteChunksByFileId,
  insertChunkWithEmbedding,
  getChunkWithEmbedding
} from './operations';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Database Operations - Files', () => {
  let testDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('inserts new file record', () => {
    const fileId = insertFile(db, 'test/file.md', 'abc123');

    expect(fileId).toBeGreaterThan(0);

    const file = getFileByPath(db, 'test/file.md');
    expect(file).toBeDefined();
    expect(file?.path).toBe('test/file.md');
    expect(file?.hash).toBe('abc123');
  });
});

describe('Database Operations - Chunks', () => {
  let testDbPath: string;
  let db: Database.Database;
  let fileId: number;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
    fileId = insertFile(db, 'test/file.md', 'abc123');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('inserts chunk with content', () => {
    const chunkId = insertChunk(db, fileId, 0, 'Test content', 'Test content', null);

    expect(chunkId).toBeGreaterThan(0);

    const chunks = getChunksByFileId(db, fileId);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Test content');
    expect(chunks[0].chunk_index).toBe(0);
  });

  test('deletes all chunks for a file', () => {
    insertChunk(db, fileId, 0, 'Chunk 1', 'Chunk 1', null);
    insertChunk(db, fileId, 1, 'Chunk 2', 'Chunk 2', null);

    let chunks = getChunksByFileId(db, fileId);
    expect(chunks).toHaveLength(2);

    deleteChunksByFileId(db, fileId);

    chunks = getChunksByFileId(db, fileId);
    expect(chunks).toHaveLength(0);
  });

  test('stores and retrieves chunk with embedding', () => {
    const embedding = new Array(384).fill(0).map((_, i) => Math.sin(i) * 0.5);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    const chunkId = insertChunkWithEmbedding(
      db, 
      fileId, 
      0, 
      'Test with embedding', 
      'Test with embedding', 
      embeddingBuffer
    );

    expect(chunkId).toBeGreaterThan(0);

    const chunk = getChunkWithEmbedding(db, chunkId);
    expect(chunk).toBeDefined();
    expect(chunk?.embedding).toBeDefined();
    expect(chunk?.embedding).toBeInstanceOf(Buffer);
    expect(chunk?.embedding?.length).toBe(384 * 4); // 384 floats * 4 bytes
  });
});
