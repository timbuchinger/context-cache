#!/usr/bin/env node
/**
 * CLI for indexing conversations
 */

import { initDatabase } from '../database/init';
import {
  extractConversations,
  getCopilotSourceDir,
  getDefaultArchiveDir,
} from '../conversations/extractor';
import { indexConversationFiles } from '../conversations/indexer';
import { indexOpencodeDatabase } from '../conversations/opencode-batch';
import { createEmbedder } from '../indexer/embedder';
import { getConfig } from '../shared/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function printUsage() {
  console.log(`
Usage: cc-conversations-index-index [options]

Extract and index AI conversations (GitHub Copilot, OpenCode) from your session logs.

Options:
  --help, -h              Show this help message
  --copilot-only          Index only Copilot conversations
  --opencode-only [path]  Index only OpenCode conversations
                          (default: ~/.local/share/opencode/opencode.db)
  --no-summaries          Skip AI summarization (use when SUMMARIZE_MODEL is not configured)

By default, indexes ALL conversation sources (Copilot + OpenCode).

Examples:
  cc-conversations-index-index                           # Index all sources
  cc-conversations-index-index --copilot-only            # Only Copilot
  cc-conversations-index-index --opencode-only           # Only OpenCode
  cc-conversations-index-index --opencode-only /path/db  # Custom path
`);
}

async function syncConversations(options: {
  source: string;
  archive: string;
  db: string;
  skipSummaries?: boolean;
}): Promise<void> {
  try {
    console.log('📥 Extracting conversations...');
    console.log(`   Source: ${options.source}`);
    console.log(`   Archive: ${options.archive}`);

    const extractResult = await extractConversations({
      sourceDir: options.source,
      archiveDir: options.archive,
    });

    console.log(`✅ Found ${extractResult.filesFound} conversation files`);
    console.log(`   Copied: ${extractResult.filesCopied}`);
    if (extractResult.filesCopied === 0) {
      console.log(`   Already archived: ${extractResult.filesSkipped}`);
    }

    // Index all archived files (new or previously skipped)
    const allArchivedFiles = fs
      .readdirSync(options.archive)
      .map(f => path.join(options.archive, f))
      .filter(f => fs.statSync(f).isFile());

    if (allArchivedFiles.length === 0) {
      console.log('✨ No conversations to index');
      return;
    }

    console.log('\n🔄 Indexing conversations...');
    const db = initDatabase(options.db);

    const embedder = await createEmbedder();

    const indexResult = await indexConversationFiles(
      db,
      allArchivedFiles,
      { embedder, skipSummaries: options.skipSummaries }
    );

    db.close();

    console.log(`✅ Indexed ${indexResult.conversationsIndexed} conversations`);
    console.log(`   Exchanges: ${indexResult.exchangesIndexed}`);
    console.log(`   Skipped (unchanged): ${indexResult.conversationsSkipped}`);
    if (indexResult.summariesGenerated > 0) {
      console.log(`   Summaries generated: ${indexResult.summariesGenerated}`);
    }

    if (indexResult.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${indexResult.errors.length}`);
      indexResult.errors.forEach(err => console.log(`   ${err}`));
    }

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

async function indexOpencodeConversations(options: {
  opencodeDb: string;
  db: string;
  skipSummaries?: boolean;
}): Promise<void> {
  try {
    if (!fs.existsSync(options.opencodeDb)) {
      console.error(`❌ OpenCode database not found: ${options.opencodeDb}`);
      process.exit(1);
    }

    console.log('📥 Indexing OpenCode conversations...');
    console.log(`   OpenCode DB: ${options.opencodeDb}`);
    console.log(`   Target DB: ${options.db}`);

    const db = initDatabase(options.db);

    const embedder = await createEmbedder();

    const result = await indexOpencodeDatabase(db, options.opencodeDb, { embedder, skipSummaries: options.skipSummaries });

    db.close();

    console.log(`\n✅ Indexed ${result.conversationsIndexed} conversations`);
    console.log(`   Exchanges: ${result.exchangesIndexed}`);
    console.log(`   Skipped (unchanged): ${result.conversationsSkipped}`);
    if (result.summariesGenerated > 0) {
      console.log(`   Summaries generated: ${result.summariesGenerated}`);
    }

    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${result.errors.length}`);
      result.errors.forEach(err => console.log(`   ${err}`));
    }

    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const dbPath = getConfig('databasePath') as string;

  const copilotOnly = args.includes('--copilot-only');
  const opencodeOnlyIdx = args.indexOf('--opencode-only');
  const opencodeOnly = opencodeOnlyIdx !== -1;
  const skipSummaries = args.includes('--no-summaries');

  // Determine what to index
  const indexCopilot = !opencodeOnly; // Index unless opencode-only flag
  const indexOpencode = !copilotOnly; // Index unless copilot-only flag

  try {
    // Index Copilot conversations
    if (indexCopilot) {
      const sourcePath = getCopilotSourceDir();
      const archivePath = getDefaultArchiveDir();

      console.log('📥 Syncing Copilot conversations...\n');
      await syncConversations({
        source: sourcePath,
        archive: archivePath,
        db: dbPath,
        skipSummaries,
      });
    }

    // Index OpenCode conversations
    if (indexOpencode) {
      let opencodeDbPath = path.join(os.homedir(), '.local/share/opencode/opencode.db');

      // Check for custom path after --opencode-only
      if (opencodeOnly && args[opencodeOnlyIdx + 1] && !args[opencodeOnlyIdx + 1].startsWith('--')) {
        opencodeDbPath = args[opencodeOnlyIdx + 1];
      }

      // Only attempt if database exists
      if (fs.existsSync(opencodeDbPath)) {
        if (indexCopilot) {
          console.log('\n'); // Add spacing between sources
        }
        console.log('📥 Syncing OpenCode conversations...\n');
        await indexOpencodeConversations({
          opencodeDb: opencodeDbPath,
          db: dbPath,
          skipSummaries,
        });
      } else if (opencodeOnly) {
        // Only error if user explicitly requested opencode
        console.error(`❌ OpenCode database not found: ${opencodeDbPath}`);
        process.exit(1);
      } else {
        // Just skip silently if not found and we're doing all sources
        console.log(`ℹ️  OpenCode database not found (${opencodeDbPath}), skipping`);
      }
    }

    console.log('\n✨ All conversations synced!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
