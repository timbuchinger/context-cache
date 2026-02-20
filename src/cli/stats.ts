import Database from 'better-sqlite3';
import * as fs from 'fs';

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  avgChunksPerFile: number;
  databaseSizeBytes: number;
  files?: string[];
}

export interface StatsOptions {
  includeFiles?: boolean;
}

export function getIndexStats(dbPath: string, options: StatsOptions = {}): IndexStats {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found at ${dbPath}`);
  }

  const db = new Database(dbPath);
  
  try {
    // Count total files
    const fileCount = db.prepare('SELECT COUNT(*) as count FROM files').get() as { count: number };
    const totalFiles = fileCount.count;

    // Count total chunks
    const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };
    const totalChunks = chunkCount.count;

    // Calculate average chunks per file
    const avgChunksPerFile = totalFiles > 0 ? totalChunks / totalFiles : 0;

    // Get database file size
    const stats = fs.statSync(dbPath);
    const databaseSizeBytes = stats.size;

    // Optionally get file paths
    let files: string[] | undefined;
    if (options.includeFiles) {
      const rows = db.prepare('SELECT path FROM files ORDER BY path').all() as { path: string }[];
      files = rows.map(row => row.path);
    }

    return {
      totalFiles,
      totalChunks,
      avgChunksPerFile,
      databaseSizeBytes,
      files,
    };
  } finally {
    db.close();
  }
}
