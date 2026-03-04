#!/usr/bin/env node

// Force GC exposure for memory management
if (global.gc === undefined) {
  console.warn('⚠️  Warning: Run with --expose-gc flag to enable manual garbage collection');
} else {
  console.log('✓ Manual GC enabled');
}

import { indexFiles } from './indexer/index';
import { createEmbedder } from './indexer/embedder';
import { initDatabase } from './database/init';
import { getConfig } from './shared/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';

function printUsage() {
  console.log(`
Usage: context-cache-index [options]

Options:
  --path <dir>         Path to knowledge base (default: from config)
  --db <path>          Path to database (default: from config)
  --ollama-url <url>   Ollama API endpoint (default: http://localhost:11434)
  --ollama-model <m>   Ollama embedding model (default: nomic-embed-text)
  --quiet              Suppress verbose output, show only summary
  --help, -h           Show this help message

Environment Variables:
  CONTEXT_CACHE_KNOWLEDGE_BASE_PATH   Knowledge base directory
  CONTEXT_CACHE_DATABASE_PATH         Database file path
  OLLAMA_API_URL                      Ollama API endpoint
  OLLAMA_EMBED_MODEL                  Ollama embedding model

Examples:
  context-cache-index
  context-cache-index --path ~/my-notes
  context-cache-index --ollama-url http://ollama:11434
  context-cache-index --quiet --db ~/custom/db.sqlite --path ~/notes
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  let kbPath = getConfig('knowledgeBasePath') as string;
  let dbPath = getConfig('databasePath') as string;
  const quiet = args.includes('--quiet');

  const pathIndex = args.findIndex(arg => arg === '--path');
  if (pathIndex !== -1 && args[pathIndex + 1]) {
    kbPath = args[pathIndex + 1];
  }

  const dbIndex = args.findIndex(arg => arg === '--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    dbPath = args[dbIndex + 1];
  }

  const ollamaUrlIndex = args.findIndex(arg => arg === '--ollama-url');
  if (ollamaUrlIndex !== -1 && args[ollamaUrlIndex + 1]) {
    process.env.OLLAMA_API_URL = args[ollamaUrlIndex + 1];
  }

  const ollamaModelIndex = args.findIndex(arg => arg === '--ollama-model');
  if (ollamaModelIndex !== -1 && args[ollamaModelIndex + 1]) {
    process.env.OLLAMA_EMBED_MODEL = args[ollamaModelIndex + 1];
  }

  // Validate paths
  if (!fs.existsSync(kbPath)) {
    console.error(`❌ Error: Knowledge base path does not exist: ${kbPath}`);
    console.error('\nTip: Create the directory or set CONTEXT_CACHE_KNOWLEDGE_BASE_PATH');
    process.exit(1);
  }

  if (!quiet) {
    console.log('📚 Context Cache Indexer\n');
    console.log('━'.repeat(60));
    console.log(`Knowledge Base: ${kbPath}`);
    console.log(`Database:       ${dbPath}`);
    console.log('━'.repeat(60));
    console.log();
  }

  try {
    // Initialize database (always use initDatabase to ensure consistent pragmas)
    const isNew = !fs.existsSync(dbPath);
    if (!quiet) console.log(isNew ? '📦 Creating new database...' : '📦 Using existing database...');
    const db = initDatabase(dbPath);

    const memAfterDB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
    if (!quiet) console.log(`   Memory after DB open: ${memAfterDB} MB`);

    // Create embedder (connects to Ollama)
    if (!quiet) console.log('🧠 Loading embedding model from Ollama...');
    const embedder = await createEmbedder();
    if (!quiet) console.log('✓ Connected to Ollama\n');

    // Index files
    if (!quiet) console.log('🔍 Indexing files...\n');
    const startTime = Date.now();

    const stats = await indexFiles(db, kbPath, embedder, { quiet });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print results
    if (quiet) {
      // Quiet mode: one line with summary
      const hasChanges = stats.filesAdded + stats.filesUpdated + stats.filesDeleted > 0;
      if (hasChanges) {
        console.log(
          `📝 KB: +${stats.filesAdded} ~${stats.filesUpdated} -${stats.filesDeleted} | ` +
          `Time: ${duration}s`
        );
      } else {
        console.log(`✓ No KB changes checked (${stats.filesProcessed} files, ${duration}s)`);
      }

      if (stats.errors.length > 0) {
        console.error(`⚠️  Errors: ${stats.errors.length}`);
        stats.errors.forEach(error => console.error(`  • ${error}`));
      }
    } else {
      // Verbose mode
      console.log('\n' + '━'.repeat(60));
      console.log('📊 Indexing Complete\n');
      console.log(`Files Processed:  ${stats.filesProcessed}`);
      console.log(`  • Added:        ${stats.filesAdded}`);
      console.log(`  • Updated:      ${stats.filesUpdated}`);
      console.log(`  • Skipped:      ${stats.filesSkipped}`);
      console.log(`  • Deleted:      ${stats.filesDeleted}`);
      console.log(`Chunks Created:   ${stats.chunksCreated}`);
      console.log(`Time:             ${duration}s`);

      if (stats.errors.length > 0) {
        console.log(`\n⚠️  Errors:        ${stats.errors.length}`);
        stats.errors.forEach(error => console.log(`  • ${error}`));
      }

      console.log('━'.repeat(60));
      console.log();
    }

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    if (!quiet) {
      console.error('\nStack trace:', (error as Error).stack);
    }
    process.exit(1);
  }
}

main();
