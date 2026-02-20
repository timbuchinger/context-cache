import Database from 'better-sqlite3';
import { findMarkdownFiles, computeFileHash } from './file-processor';
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

export interface IndexStats {
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  filesDeleted: number;
  chunksCreated: number;
  errors: string[];
}

export async function indexFiles(
  db: Database.Database,
  knowledgeBasePath: string,
  embedder: Embedder
): Promise<IndexStats> {
  const stats: IndexStats = {
    filesProcessed: 0,
    filesAdded: 0,
    filesUpdated: 0,
    filesSkipped: 0,
    filesDeleted: 0,
    chunksCreated: 0,
    errors: []
  };

  // Get config
  const chunkSize = getConfig('chunkSize');
  const chunkOverlap = getConfig('chunkOverlap');

  // Find all markdown files
  const markdownFiles = findMarkdownFiles(knowledgeBasePath);
  
  // Create a set of relative paths for quick lookup
  const currentFilePaths = new Set(
    markdownFiles.map(fp => path.relative(knowledgeBasePath, fp))
  );

  // Get all files from database and check for deletions
  const dbFiles = getAllFiles(db);
  for (const dbFile of dbFiles) {
    if (!currentFilePaths.has(dbFile.path)) {
      // File was deleted from disk
      try {
        deleteChunksByFileId(db, dbFile.id);
        deleteFile(db, dbFile.id);
        stats.filesDeleted++;
      } catch (error) {
        stats.errors.push(`Error deleting ${dbFile.path}: ${error}`);
      }
    }
  }

  for (const filePath of markdownFiles) {
    stats.filesProcessed++;

    try {
      // Compute relative path
      const relativePath = path.relative(knowledgeBasePath, filePath);
      
      // Compute hash
      const fileHash = computeFileHash(filePath);
      
      // Check if file exists in database
      const existingFile = getFileByPath(db, relativePath);
      
      if (existingFile) {
        // Check if hash changed
        if (existingFile.hash === fileHash) {
          stats.filesSkipped++;
          continue; // Skip unchanged file
        }
        
        // File changed - update it
        stats.filesUpdated++;
        
        // Delete old chunks
        deleteChunksByFileId(db, existingFile.id);
        
        // Update hash
        updateFileHash(db, existingFile.id, fileHash);
        
        // Process file content
        await processFileContent(
          db, 
          existingFile.id, 
          filePath, 
          relativePath,
          chunkSize, 
          chunkOverlap, 
          embedder,
          stats
        );
      } else {
        // New file - add it
        stats.filesAdded++;
        
        // Insert file record
        const fileId = insertFile(db, relativePath, fileHash);
        
        // Process file content
        await processFileContent(
          db, 
          fileId, 
          filePath, 
          relativePath,
          chunkSize, 
          chunkOverlap, 
          embedder,
          stats
        );
      }
    } catch (error) {
      stats.errors.push(`Error processing ${filePath}: ${error}`);
    }
  }

  return stats;
}

async function processFileContent(
  db: Database.Database,
  fileId: number,
  filePath: string,
  relativePath: string,
  chunkSize: number,
  chunkOverlap: number,
  embedder: Embedder,
  stats: IndexStats
): Promise<void> {
  // Read file content
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Chunk the text
  const chunks = chunkText(content, chunkSize, chunkOverlap);
  
  // Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i];
    
    // Generate embedding
    const embedding = await embedder.generateEmbedding(chunkContent);
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
    
    // Insert chunk with embedding
    const chunkId = insertChunkWithEmbedding(
      db,
      fileId,
      i,
      chunkContent,
      chunkContent,
      embeddingBuffer
    );
    
    // Populate FTS5 table
    db.prepare('INSERT INTO chunks_fts (rowid, content) VALUES (?, ?)').run(chunkId, chunkContent);
    
    stats.chunksCreated++;
  }
}
