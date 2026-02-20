import Database from 'better-sqlite3';
import { FileRecord, ChunkRecord } from '../shared/types';

export function insertFile(db: Database.Database, filePath: string, hash: string): number {
  const stmt = db.prepare('INSERT INTO files (path, hash) VALUES (?, ?)');
  const result = stmt.run(filePath, hash);
  return result.lastInsertRowid as number;
}

export function getFileByPath(db: Database.Database, filePath: string): FileRecord | undefined {
  const stmt = db.prepare('SELECT * FROM files WHERE path = ?');
  return stmt.get(filePath) as FileRecord | undefined;
}

export function getAllFiles(db: Database.Database): FileRecord[] {
  const stmt = db.prepare('SELECT * FROM files');
  return stmt.all() as FileRecord[];
}

export function updateFileHash(db: Database.Database, fileId: number, hash: string): void {
  const stmt = db.prepare('UPDATE files SET hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  stmt.run(hash, fileId);
}

export function deleteFile(db: Database.Database, fileId: number): void {
  const stmt = db.prepare('DELETE FROM files WHERE id = ?');
  stmt.run(fileId);
}

export function insertChunk(
  db: Database.Database,
  fileId: number,
  chunkIndex: number,
  content: string,
  rawText: string,
  embedding: Buffer | null
): number {
  const stmt = db.prepare(
    'INSERT INTO chunks (file_id, chunk_index, content, raw_text, embedding) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(fileId, chunkIndex, content, rawText, embedding);
  return result.lastInsertRowid as number;
}

export function getChunksByFileId(db: Database.Database, fileId: number): ChunkRecord[] {
  const stmt = db.prepare('SELECT * FROM chunks WHERE file_id = ? ORDER BY chunk_index');
  return stmt.all(fileId) as ChunkRecord[];
}

export function deleteChunksByFileId(db: Database.Database, fileId: number): void {
  const stmt = db.prepare('DELETE FROM chunks WHERE file_id = ?');
  stmt.run(fileId);
}

export function insertChunkWithEmbedding(
  db: Database.Database,
  fileId: number,
  chunkIndex: number,
  content: string,
  rawText: string,
  embedding: Buffer
): number {
  const stmt = db.prepare(
    'INSERT INTO chunks (file_id, chunk_index, content, raw_text, embedding) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(fileId, chunkIndex, content, rawText, embedding);
  return result.lastInsertRowid as number;
}

export function getChunkWithEmbedding(db: Database.Database, chunkId: number): ChunkRecord | undefined {
  const stmt = db.prepare('SELECT * FROM chunks WHERE id = ?');
  return stmt.get(chunkId) as ChunkRecord | undefined;
}

