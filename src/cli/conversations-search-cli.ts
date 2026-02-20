#!/usr/bin/env node

import { searchConversations } from '../conversations/search';
import { initDatabase } from '../database/init';
import * as path from 'path';
import * as os from 'os';

function printUsage() {
  console.log(`
Usage: cc-conversations-search <query> [options]

Search through your indexed AI conversations.

Arguments:
  query              Search query (required)

Options:
  --limit, -l <n>    Maximum number of results (default: 10)
  --help, -h         Show this help message

Examples:
  cc-conversations-search "async patterns"
  cc-conversations-search "error handling" --limit 5
  cc-conversations-search "TypeScript types" -l 3
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  // Parse arguments
  const query = args[0];
  let limit = 10;

  const limitIndex = args.findIndex(arg => arg === '--limit' || arg === '-l');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    limit = parseInt(args[limitIndex + 1], 10);
    if (isNaN(limit) || limit < 1) {
      console.error('❌ Error: Limit must be a positive number');
      process.exit(1);
    }
  }

  const dbPath = path.join(os.homedir(), '.context-cache', 'context-cache.db');

  try {
    console.log(`🔍 Searching conversations for: "${query}"\n`);

    const db = initDatabase(dbPath);
    const results = await searchConversations(db, query, { limit });
    db.close();

    if (results.length === 0) {
      console.log('No results found.\n');
      process.exit(0);
    }

    console.log(`Found ${results.length} result(s):\n`);
    console.log('━'.repeat(80));

    results.forEach((result, index) => {
      console.log(`\n${index + 1}. [${result.source}] ${result.sessionId.substring(0, 8)}...`);
      console.log(`   Date: ${new Date(result.timestamp).toLocaleString()}`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   User: ${result.userMessage.substring(0, 100)}${result.userMessage.length > 100 ? '...' : ''}`);
      console.log(`   Assistant: ${result.assistantMessage.substring(0, 100)}${result.assistantMessage.length > 100 ? '...' : ''}`);
    });

    console.log('\n' + '━'.repeat(80) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error('\nTip: Make sure conversations are indexed. Run: cc-conversations-index-index');
    process.exit(1);
  }
}

main();
