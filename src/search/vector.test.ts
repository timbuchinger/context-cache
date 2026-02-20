import Database from 'better-sqlite3';
import { initDatabase } from '../database/init';
import { insertFile, insertChunkWithEmbedding } from '../database/operations';
import { vectorSearch } from './vector';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Vector Search', () => {
  let testDbPath: string;
  let db: Database.Database;
  let fileId: number;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
    db = initDatabase(testDbPath);
    fileId = insertFile(db, 'test/file.md', 'abc123');

    // Insert test chunks with embeddings
    const embedding1 = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);
    const embedding2 = new Array(384).fill(0).map((_, i) => i >= 10 && i < 20 ? 1.0 : 0.0);
    const embedding3 = new Array(384).fill(0).map((_, i) => i < 10 ? 0.8 : 0.0);

    insertChunkWithEmbedding(db, fileId, 0, 'First chunk', 'First chunk', 
      Buffer.from(new Float32Array(embedding1).buffer));
    insertChunkWithEmbedding(db, fileId, 1, 'Second chunk', 'Second chunk', 
      Buffer.from(new Float32Array(embedding2).buffer));
    insertChunkWithEmbedding(db, fileId, 2, 'Third chunk', 'Third chunk', 
      Buffer.from(new Float32Array(embedding3).buffer));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('finds similar chunks by vector similarity', () => {
    // Query embedding similar to embedding1 and embedding3
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 0.9 : 0.0);

    const results = vectorSearch(db, queryEmbedding, 10);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk_id).toBeDefined();
    expect(results[0].similarity).toBeGreaterThan(0);
    expect(results[0].content).toBeDefined();
  });

  test('returns results ordered by similarity', () => {
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);

    const results = vectorSearch(db, queryEmbedding, 10);

    expect(results.length).toBeGreaterThanOrEqual(2);
    // Similarity should be in descending order
    for (let i = 0; i < results.length - 1; i++) {
      expect(results[i].similarity).toBeGreaterThanOrEqual(results[i + 1].similarity);
    }
  });

  test('limits number of results', () => {
    const queryEmbedding = new Array(384).fill(0).map((_, i) => i < 10 ? 1.0 : 0.0);

    const results = vectorSearch(db, queryEmbedding, 1);

    expect(results).toHaveLength(1);
  });
});
