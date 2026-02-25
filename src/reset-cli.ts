#!/usr/bin/env node

import { resetDatabase } from './database/reset';
import { getConfig } from './shared/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as readline from 'readline';

function printUsage() {
  console.log(`
Usage: cc-reset [options]

Resets the Context Cache database by deleting all indexed data.

Options:
  --db <path>        Path to database (default: from config)
  --force, -f        Skip confirmation prompt
  --help, -h         Show this help message

Environment Variables:
  CONTEXT_CACHE_DATABASE_PATH         Database file path

Examples:
  cc-reset
  cc-reset --force
  cc-reset --db ~/custom/db.sqlite
`);
}

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Parse arguments
  let dbPath = getConfig('databasePath') as string;
  const force = args.includes('--force') || args.includes('-f');

  const dbIndex = args.findIndex(arg => arg === '--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    dbPath = args[dbIndex + 1];
  }

  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Error: Database does not exist: ${dbPath}`);
    process.exit(1);
  }

  console.log('🗑️  Context Cache Reset\n');
  console.log('━'.repeat(60));
  console.log(`Database: ${dbPath}`);
  console.log('━'.repeat(60));
  console.log();

  // Confirm action
  if (!force) {
    console.log('⚠️  WARNING: This will delete ALL indexed data:');
    console.log('  • All knowledge base files and chunks');
    console.log('  • All conversations and exchanges');
    console.log('  • All embeddings and search indexes');
    console.log();

    const confirmed = await confirm('Are you sure you want to continue? (y/N) ');

    if (!confirmed) {
      console.log('\n❌ Reset cancelled');
      process.exit(0);
    }
  }

  try {
    // Open database
    const db = new Database(dbPath);

    console.log('\n🔄 Resetting database...');
    resetDatabase(db);
    console.log('✓ Database reset complete');

    db.close();

    console.log('\n━'.repeat(60));
    console.log('✅ All data has been deleted');
    console.log('━'.repeat(60));
    console.log();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error('\nStack trace:', (error as Error).stack);
    process.exit(1);
  }
}

main();
