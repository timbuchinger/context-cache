#!/usr/bin/env node

import { searchNotes } from './cli/search';
import { getConfig } from './shared/config';

function printUsage() {
  console.log(`
Usage: cc-kb-search <query> [options]

Arguments:
  query              Search query (required)

Options:
  --limit, -l <n>    Maximum number of results (default: 10)
  --help, -h         Show this help message

Examples:
  cc-kb-search "TypeScript programming"
  cc-kb-search "async await" --limit 5
  cc-kb-search "error handling" -l 3
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

  const dbPath = getConfig('databasePath') as string;

  try {
    console.log(`🔍 Searching for: "${query}"\n`);

    const results = await searchNotes(dbPath, query, limit);

    if (results.length === 0) {
      console.log('No results found.\n');
      process.exit(0);
    }

    console.log(`Found ${results.length} result(s):\n`);
    console.log('━'.repeat(80));

    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.source_path} (chunk ${result.chunk_index})`);
      console.log(`   Score: ${result.score.toFixed(4)}`);
      console.log(`   ${result.content.substring(0, 200)}${result.content.length > 200 ? '...' : ''}`);
    });

    console.log('\n' + '━'.repeat(80) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error('\nTip: Make sure the database exists and is indexed.');
    process.exit(1);
  }
}

main();
