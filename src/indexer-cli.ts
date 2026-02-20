#!/usr/bin/env node

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
  --path <dir>       Path to knowledge base (default: from config)
  --db <path>        Path to database (default: from config)
  --help, -h         Show this help message

Environment Variables:
  CONTEXT_CACHE_KNOWLEDGE_BASE_PATH   Knowledge base directory
  CONTEXT_CACHE_DATABASE_PATH         Database file path

Examples:
  context-cache-index
  context-cache-index --path ~/my-notes
  context-cache-index --db ~/custom/db.sqlite --path ~/notes
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

  const pathIndex = args.findIndex(arg => arg === '--path');
  if (pathIndex !== -1 && args[pathIndex + 1]) {
    kbPath = args[pathIndex + 1];
  }

  const dbIndex = args.findIndex(arg => arg === '--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    dbPath = args[dbIndex + 1];
  }

  // Validate paths
  if (!fs.existsSync(kbPath)) {
    console.error(`❌ Error: Knowledge base path does not exist: ${kbPath}`);
    console.error('\nTip: Create the directory or set CONTEXT_CACHE_KNOWLEDGE_BASE_PATH');
    process.exit(1);
  }

  console.log('📚 Context Cache Indexer\n');
  console.log('━'.repeat(60));
  console.log(`Knowledge Base: ${kbPath}`);
  console.log(`Database:       ${dbPath}`);
  console.log('━'.repeat(60));
  console.log();

  try {
    // Initialize database
    let db: Database.Database;
    if (!fs.existsSync(dbPath)) {
      console.log('📦 Creating new database...');
      db = initDatabase(dbPath);
    } else {
      console.log('📦 Using existing database...');
      db = new Database(dbPath);
    }

    // Create embedder
    console.log('🧠 Loading embedding model...');
    const embedder = await createEmbedder();
    console.log('✓ Model loaded\n');

    // Index files
    console.log('🔍 Indexing files...\n');
    const startTime = Date.now();

    const stats = await indexFiles(db, kbPath, embedder);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Print results
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

    db.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error('\nStack trace:', (error as Error).stack);
    process.exit(1);
  }
}

main();
