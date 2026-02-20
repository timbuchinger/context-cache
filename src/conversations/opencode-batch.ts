/**
 * Utility to index all OpenCode conversations from database
 */

import Database from 'better-sqlite3';
import { indexConversationFile, IndexResult, IndexOptions, getAllConversationsBySource, deleteConversation } from './indexer';

interface OpencodeSessionRow {
  id: string;
  title: string;
  time_created: number;
}

/**
 * Index all conversations from an OpenCode database
 */
export async function indexOpencodeDatabase(
  targetDb: Database.Database,
  opencodeDbPath: string,
  options?: IndexOptions
): Promise<IndexResult> {
  const opencodeDb = new Database(opencodeDbPath, { readonly: true });

  try {
    // Get all sessions from OpenCode database
    const sessions = opencodeDb
      .prepare('SELECT id, title, time_created FROM session ORDER BY time_created DESC')
      .all() as OpencodeSessionRow[];

    console.log(`Found ${sessions.length} OpenCode sessions to index`);

    const result: IndexResult = {
      conversationsIndexed: 0,
      exchangesIndexed: 0,
      conversationsSkipped: 0,
      conversationsDeleted: 0,
      errors: [],
    };

    // Detect OpenCode conversations in our DB whose sessions no longer exist
    // in the OpenCode database, and remove them.
    const currentSessionIds = new Set(sessions.map(s => s.id));
    const indexedConversations = getAllConversationsBySource(targetDb, 'opencode');
    for (const conv of indexedConversations) {
      if (!currentSessionIds.has(conv.id)) {
        try {
          deleteConversation(targetDb, conv.id);
          result.conversationsDeleted++;
        } catch (err) {
          result.errors.push(`Error deleting conversation ${conv.id}: ${err}`);
        }
      }
    }

    for (const session of sessions) {
      try {
        const indexResult = await indexConversationFile(
          targetDb,
          opencodeDbPath,
          {
            ...options,
            sessionId: session.id,
          }
        );

        if (indexResult.indexed) {
          result.conversationsIndexed++;
          result.exchangesIndexed += indexResult.exchangeCount;
          console.log(`✓ Indexed ${session.title} (${indexResult.exchangeCount} exchanges)`);
        } else {
          result.conversationsSkipped++;
          console.log(`○ Skipped ${session.title} (unchanged)`);
        }
      } catch (err) {
        result.errors.push(`${session.id} (${session.title}): ${err}`);
        console.error(`✗ Error indexing ${session.title}: ${err}`);
      }
    }

    return result;
  } finally {
    opencodeDb.close();
  }
}
