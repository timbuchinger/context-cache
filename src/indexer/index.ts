import Database from 'better-sqlite3';
import { streamMarkdownFiles } from './file-processor';
import { chunkText } from './chunker';
import { Embedder } from './embedder';
import {
  getFileByPath,
  getAllFiles,
  insertFile,
  updateFileHash,
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
        deleteChunksByFileId(db, existingFile.id);

        await processFileContent(
          db,
          existingFile.id,
          content,
          chunkSize,
          chunkOverlap,
          embedder,
          stats
        );

        updateFileHash(db, existingFile.id, fileHash);
      } else {
        stats.filesAdded++;
        const fileId = insertFile(db, relativePath, '');

        await processFileContent(
          db,
          fileId,
          content,
          chunkSize,
          chunkOverlap,
          embedder,
          stats
        );

        updateFileHash(db, fileId, fileHash);
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

async function processFileContent(
  db: Database.Database,
  fileId: number,
  content: string,
  chunkSize: number,
  chunkOverlap: number,
  embedder: Embedder,
  stats: IndexStats
): Promise<void> {
  const chunks = chunkText(content, chunkSize, chunkOverlap);

  const ftsStmt = db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)');

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    
    try {
      const embedding = await embedder.generateEmbedding(chunkContent);
      const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

      const chunkId = insertChunkWithEmbedding(
        db,
        fileId,
        i,
        chunkContent,
        chunkContent,
        embeddingBuffer
      );

      ftsStmt.run(chunkId, chunkContent);
      stats.chunksCreated++;
    } catch (error) {
      throw new Error(`Failed to embed chunk ${i}: ${error}`);
    }
  }
}
