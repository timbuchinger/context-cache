/**
 * Extract and archive conversation files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface ExtractionOptions {
  sourceDir: string;
  archiveDir: string;
  filePattern?: RegExp;
}

export interface ExtractionResult {
  filesFound: number;
  filesCopied: number;
  filesSkipped: number;
  archivedFiles: string[];
}

export async function extractConversations(
  options: ExtractionOptions
): Promise<ExtractionResult> {
  const { sourceDir, archiveDir, filePattern = /\.jsonl$/ } = options;

  const result: ExtractionResult = {
    filesFound: 0,
    filesCopied: 0,
    filesSkipped: 0,
    archivedFiles: [],
  };

  // Ensure archive directory exists
  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  // Find all matching files in source directory
  const files = findConversationFiles(sourceDir, filePattern);
  result.filesFound = files.length;

  for (const sourceFile of files) {
    // Generate unique filename to avoid collisions from subdirectories
    // For files like session-id/events.jsonl, use session-id-events.jsonl
    const relativePath = path.relative(sourceDir, sourceFile);
    const uniqueFileName = relativePath.replace(/\//g, '-').replace(/\\/g, '-');
    const destFile = path.join(archiveDir, uniqueFileName);

    // Check if file already archived and up-to-date
    if (fs.existsSync(destFile)) {
      const sourceStats = fs.statSync(sourceFile);
      const destStats = fs.statSync(destFile);

      if (sourceStats.mtime <= destStats.mtime) {
        result.filesSkipped++;
        continue;
      }
    }

    // Copy file to archive
    fs.copyFileSync(sourceFile, destFile);
    result.filesCopied++;
    result.archivedFiles.push(destFile);
  }

  return result;
}

function findConversationFiles(dir: string, pattern: RegExp): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isFile() && pattern.test(entry.name)) {
      files.push(fullPath);
    } else if (entry.isDirectory()) {
      // Recursively search subdirectories
      files.push(...findConversationFiles(fullPath, pattern));
    }
  }

  return files;
}

export function getDefaultArchiveDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.context-cache', 'conversations');
}

export function getCopilotSourceDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.copilot', 'session-state');
}
