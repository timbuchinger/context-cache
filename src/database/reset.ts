import Database from 'better-sqlite3';

export function resetDatabase(db: Database.Database): void {
  // Delete all data from tables
  db.prepare('DELETE FROM chunks').run();
  db.prepare('DELETE FROM files').run();
  
  // Clear FTS5 table
  db.prepare('DELETE FROM chunks_fts').run();
  
  // Reset auto-increment counters
  db.prepare('DELETE FROM sqlite_sequence WHERE name IN (?, ?)').run('files', 'chunks');
  
  // Optimize database (reclaim space)
  db.prepare('VACUUM').run();
}
