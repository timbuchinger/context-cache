import Database from 'better-sqlite3';
import { initDatabase } from './init';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Database Initialization', () => {
  let testDbPath: string;

  beforeEach(() => {
    // Create unique temp database for each test
    testDbPath = path.join(os.tmpdir(), `test-context-cache-${Date.now()}.db`);
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  test('creates database with files table', () => {
    const db = initDatabase(testDbPath);

    // Query table info
    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='files'"
    ).get();

    expect(tableInfo).toBeDefined();
    expect(tableInfo).toHaveProperty('name', 'files');

    db.close();
  });

  test('creates database with chunks table', () => {
    const db = initDatabase(testDbPath);

    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks'"
    ).get();

    expect(tableInfo).toBeDefined();
    expect(tableInfo).toHaveProperty('name', 'chunks');

    db.close();
  });

  test('creates FTS5 virtual table for full-text search', () => {
    const db = initDatabase(testDbPath);

    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='chunks_fts'"
    ).get();

    expect(tableInfo).toBeDefined();
    expect(tableInfo).toHaveProperty('name', 'chunks_fts');

    db.close();
  });

  test('creates conversations table', () => {
    const db = initDatabase(testDbPath);

    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'"
    ).get();

    expect(tableInfo).toBeDefined();
    expect(tableInfo).toHaveProperty('name', 'conversations');

    db.close();
  });

  test('creates exchanges table', () => {
    const db = initDatabase(testDbPath);

    const tableInfo = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='exchanges'"
    ).get();

    expect(tableInfo).toBeDefined();
    expect(tableInfo).toHaveProperty('name', 'exchanges');

    db.close();
  });

  test('creates conversation indexes', () => {
    const db = initDatabase(testDbPath);

    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_conv_%'"
    ).all();

    expect(indexes.length).toBeGreaterThanOrEqual(3);

    db.close();
  });
});
