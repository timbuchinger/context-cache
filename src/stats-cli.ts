#!/usr/bin/env node

import { getIndexStats } from './cli/stats';
import { initDatabase } from './database/init';
import { getConfig } from './shared/config';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

function main() {
  const dbPath = getConfig('databasePath') as string;
  const includeFiles = process.argv.includes('--files') || process.argv.includes('-f');

  try {
    console.log('\n📊 Context Cache Statistics\n');
    console.log('━'.repeat(60));

    // Knowledge Base Stats
    console.log('\n📚 Knowledge Base Index\n');
    const kbStats = getIndexStats(dbPath, { includeFiles: false });
    console.log(`Database:         ${dbPath}`);
    console.log(`Total Files:      ${kbStats.totalFiles}`);
    console.log(`Total Chunks:     ${kbStats.totalChunks}`);
    console.log(`Avg Chunks/File:  ${kbStats.avgChunksPerFile.toFixed(2)}`);
    console.log(`Database Size:    ${formatBytes(kbStats.databaseSizeBytes)}`);

    if (includeFiles && kbStats.files && kbStats.files.length > 0) {
      console.log('\n📄 Indexed Files:\n');
      kbStats.files.forEach(file => console.log(`  • ${file}`));
    }

    // Conversation Stats
    console.log('\n\n💬 Conversation Index\n');
    const convDb = initDatabase(dbPath);

    const convCount = convDb
      .prepare('SELECT COUNT(*) as count FROM conversations')
      .get() as any;
    const exchCount = convDb
      .prepare('SELECT COUNT(*) as count FROM exchanges')
      .get() as any;
    const sources = convDb
      .prepare(
        'SELECT source, COUNT(*) as count FROM conversations GROUP BY source'
      )
      .all() as any[];

    console.log(`Total Conversations: ${convCount?.count || 0}`);
    console.log(`Total Exchanges:     ${exchCount?.count || 0}`);

    if (sources.length > 0) {
      console.log('\nBy source:');
      sources.forEach(s => {
        console.log(`  ${s.source}: ${s.count}`);
      });
    }

    const recent = convDb
      .prepare(
        'SELECT id, timestamp, exchange_count FROM conversations ORDER BY timestamp DESC LIMIT 5'
      )
      .all() as any[];

    if (recent.length > 0) {
      console.log('\nRecent conversations:');
      recent.forEach(c => {
        const date = new Date(c.timestamp).toLocaleString();
        console.log(`  ${c.id.substring(0, 8)}... ${date} (${c.exchange_count} exchanges)`);
      });
    }

    convDb.close();

    console.log('\n' + '━'.repeat(60) + '\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    console.error('\nTip: Make sure the database exists. Run indexers first.');
    process.exit(1);
  }
}

main();
