import Database from 'better-sqlite3';
import { streamMarkdownFiles } from './file-processor';
import { chunkText } from './chunker';
import { Embedder } from './embedder';
import {
  getFileByPath,
  getAllFiles,
  insertFile,
  updateFileHash,
  insertChunk,
  insertChunkWithEmbedding,
  deleteChunksByFileId,
  deleteFile
} from '../database/operations';
import { getConfig } from '../shared/config';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface IndexStats {
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  filesDeleted: number;
  chunksCreated: number;
  errors: string[];
  warnings?: string[];
}

export interface IndexOptions {
  quiet?: boolean;
}

export async function indexFiles(
  db: Database.Database,
  knowledgeBasePath: string,
  embedder: Embedder,
  options?: IndexOptions
): Promise<IndexStats> {
  const quiet = options?.quiet ?? false;
  const stats: IndexStats = {
    filesProcessed: 0,
    filesAdded: 0,
    filesUpdated: 0,
    filesSkipped: 0,
    filesDeleted: 0,
    chunksCreated: 0,
    errors: []
  };

  const chunkSize = getConfig('chunkSize');
  const chunkOverlap = getConfig('chunkOverlap');

  // Track files we see during processing for deletion detection
  if (!quiet) console.log('  Indexing files...');
  const processedRelativePaths = new Set<string>();

  // Process ONE file at a time (streaming - no pre-scan)
  for (const filePath of streamMarkdownFiles(knowledgeBasePath)) {
    stats.filesProcessed++;

    try {
      const relativePath = path.relative(knowledgeBasePath, filePath);
      processedRelativePaths.add(relativePath);

      // Read file once, compute hash inline
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileHash = crypto.createHash('sha256').update(content).digest('hex');

      const existingFile = getFileByPath(db, relativePath);

      if (existingFile) {
        if (existingFile.hash === fileHash) {
          stats.filesSkipped++;
          continue;
        }

        stats.filesUpdated++;
        console.log(`  📝 Updating ${relativePath}...`);

        // Generate embeddings first (async), then commit everything atomically
        const chunkData = await generateEmbeddings(content, chunkSize, chunkOverlap, embedder, stats);
        commitFileUpdate(db, existingFile.id, fileHash, chunkData, stats);

      } else {
        stats.filesAdded++;
        console.log(`  ✨ Adding ${relativePath}...`);

        // Generate embeddings first (async), then commit everything atomically
        const chunkData = await generateEmbeddings(content, chunkSize, chunkOverlap, embedder, stats);
        commitFileInsert(db, relativePath, fileHash, chunkData, stats);
      }

      // Manually trigger GC if available to prevent memory bloat
      if (global.gc && stats.filesProcessed % 5 === 0) {
        global.gc(false); // false = non-full GC
      }

      // Show progress every 25 files
      if (!quiet && stats.filesProcessed % 25 === 0) {
        const memUsage = process.memoryUsage();
        const memMB = (memUsage.heapUsed / 1024 / 1024).toFixed(2);
        console.log(`  Processed ${stats.filesProcessed} files (${memMB} MB)\n`);
      }

    } catch (error) {
      stats.errors.push(`Error processing ${filePath}: ${error}`);
    }
  }

  // Deletion detection: remove files that exist in DB but not on disk
  // Only scan DB (much smaller than iterating file system)
  if (!quiet) console.log('  Checking for deleted files...');
  const dbFiles = getAllFiles(db);
  for (const dbFile of dbFiles) {
    if (!processedRelativePaths.has(dbFile.path)) {
      try {
        deleteChunksByFileId(db, dbFile.id);
        deleteFile(db, dbFile.id);
        stats.filesDeleted++;
      } catch (error) {
        stats.errors.push(`Error deleting ${dbFile.path}: ${error}`);
      }
    }
  }

  return stats;
}

// Generate embeddings for all chunks of a file (async, no DB writes)
async function generateEmbeddings(
  content: string,
  chunkSize: number,
  chunkOverlap: number,
  embedder: Embedder,
  stats: IndexStats
): Promise<Array<{ content: string; embedding: Buffer | null }>> {
  const chunks = chunkText(content, chunkSize, chunkOverlap);
  const chunkData: Array<{ content: string; embedding: Buffer | null }> = [];

  for (const chunkContent of chunks) {
    let embeddingBuffer: Buffer | null = null;
    try {
      const embedding = await embedder.generateEmbedding(chunkContent);
      embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    } catch (error) {
      stats.warnings = stats.warnings || [];
      stats.warnings.push(`Failed to embed chunk ${chunkData.length} (size: ${chunkContent.length}): ${error}`);
      console.warn(`⚠️  Warning: Failed to embed chunk ${chunkData.length} (content ${chunkContent.length} chars): ${error}`);
    }
    chunkData.push({ content: chunkContent, embedding: embeddingBuffer });
  }

  return chunkData;
}

// Insert a brand-new file record + all its chunks in one atomic transaction
function commitFileInsert(
  db: Database.Database,
  relativePath: string,
  fileHash: string,
  chunkData: Array<{ content: string; embedding: Buffer | null }>,
  stats: IndexStats
): void {
  db.exec('BEGIN TRANSACTION');
  try {
    const fileId = insertFile(db, relativePath, fileHash);
    const ftsStmt = db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)');
    for (let i = 0; i < chunkData.length; i++) {
      const { content: chunkContent, embedding: embeddingBuffer } = chunkData[i];
      const chunkId = insertChunk(db, fileId, i, chunkContent, chunkContent, embeddingBuffer);
      ftsStmt.run(chunkId, chunkContent);
      stats.chunksCreated++;
    }
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore rollback errors */ }
    throw error;
  }
}

// Delete old chunks + insert new chunks + update hash in one atomic transaction
function commitFileUpdate(
  db: Database.Database,
  fileId: number,
  fileHash: string,
  chunkData: Array<{ content: string; embedding: Buffer | null }>,
  stats: IndexStats
): void {
  db.exec('BEGIN TRANSACTION');
  try {
    deleteChunksByFileId(db, fileId);
    const ftsStmt = db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)');
    for (let i = 0; i < chunkData.length; i++) {
      const { content: chunkContent, embedding: embeddingBuffer } = chunkData[i];
      const chunkId = insertChunk(db, fileId, i, chunkContent, chunkContent, embeddingBuffer);
      ftsStmt.run(chunkId, chunkContent);
      stats.chunksCreated++;
    }
    updateFileHash(db, fileId, fileHash);
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* ignore rollback errors */ }
    throw error;
  }
}
