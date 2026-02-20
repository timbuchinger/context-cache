import Database from 'better-sqlite3';

export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Create files table
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT UNIQUE NOT NULL,
      hash TEXT NOT NULL,
      indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create chunks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      embedding BLOB,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      UNIQUE(file_id, chunk_index)
    )
  `);

  // Create FTS5 virtual table for BM25 search
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      content,
      content_rowid=id
    )
  `);

  // Create conversations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      session_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      archive_path TEXT NOT NULL,
      exchange_count INTEGER NOT NULL,
      hash TEXT NOT NULL,
      last_indexed INTEGER,
      copilot_version TEXT,
      cwd TEXT
    )
  `);

  // Create exchanges table
  db.exec(`
    CREATE TABLE IF NOT EXISTS exchanges (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      exchange_index INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      user_message TEXT NOT NULL,
      assistant_message TEXT NOT NULL,
      tool_calls TEXT,
      parent_id TEXT,
      embedding BLOB,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )
  `);

  // Create indexes for conversations
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_conv_timestamp ON conversations(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);
    CREATE INDEX IF NOT EXISTS idx_conv_source ON conversations(source);
  `);

  // Create indexes for exchanges
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_exchange_conv ON exchanges(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_exchange_ts ON exchanges(timestamp DESC);
  `);

  // Migration: Add hash column to conversations if it doesn't exist
  const conversationColumns = db
    .prepare("PRAGMA table_info(conversations)")
    .all() as Array<{ name: string }>;

  const hasHashColumn = conversationColumns.some(col => col.name === 'hash');

  if (!hasHashColumn) {
    console.log('📝 Migrating database: adding hash column to conversations table');
    db.exec(`ALTER TABLE conversations ADD COLUMN hash TEXT`);
    // Set a default hash for existing conversations
    db.exec(`UPDATE conversations SET hash = '' WHERE hash IS NULL`);
  }

  return db;
}
