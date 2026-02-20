/**
 * Tests for OpenCode batch indexer
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../database/init';
import { indexOpencodeDatabase } from '../opencode-batch';
import { getConversation, getExchanges } from '../indexer';

describe('OpenCode Batch Indexer', () => {
  let targetDb: Database.Database;
  let targetDbPath: string;
  let opencodeDbPath: string;
  let opencodeDb: Database.Database;

  beforeEach(() => {
    targetDbPath = path.join(os.tmpdir(), `test-target-${Date.now()}.db`);
    targetDb = initDatabase(targetDbPath);

    opencodeDbPath = path.join(os.tmpdir(), `test-opencode-${Date.now()}.db`);
    opencodeDb = new Database(opencodeDbPath);

    // Create OpenCode schema
    opencodeDb.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        version TEXT NOT NULL,
        directory TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL
      );

      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL,
        data TEXT NOT NULL
      );

      CREATE TABLE part (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
  });

  afterEach(() => {
    targetDb.close();
    opencodeDb.close();

    if (fs.existsSync(targetDbPath)) fs.unlinkSync(targetDbPath);
    if (fs.existsSync(opencodeDbPath)) fs.unlinkSync(opencodeDbPath);
  });

  function createSession(sessionId: string, title: string) {
    opencodeDb.prepare(`
      INSERT INTO session (id, project_id, title, version, directory, time_created, time_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, 'proj_1', title, '1.1.40', '/test', Date.now(), Date.now());
  }

  function createMessage(messageId: string, sessionId: string, role: 'user' | 'assistant', parentId?: string) {
    const time = Date.now();
    opencodeDb.prepare(`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      messageId,
      sessionId,
      time,
      time,
      JSON.stringify({ role, time: { created: time }, parentID: parentId || null })
    );
  }

  function createPart(partId: string, messageId: string, sessionId: string, text: string) {
    opencodeDb.prepare(`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      partId,
      messageId,
      sessionId,
      Date.now(),
      Date.now(),
      JSON.stringify({ type: 'text', text })
    );
  }

  test('indexes all sessions from OpenCode database', async () => {
    // Create two sessions with exchanges
    createSession('ses_1', 'First conversation');
    createMessage('msg_u1', 'ses_1', 'user');
    createPart('prt_u1', 'msg_u1', 'ses_1', 'Hello');
    createMessage('msg_a1', 'ses_1', 'assistant', 'msg_u1');
    createPart('prt_a1', 'msg_a1', 'ses_1', 'Hi there');

    createSession('ses_2', 'Second conversation');
    createMessage('msg_u2', 'ses_2', 'user');
    createPart('prt_u2', 'msg_u2', 'ses_2', 'How are you?');
    createMessage('msg_a2', 'ses_2', 'assistant', 'msg_u2');
    createPart('prt_a2', 'msg_a2', 'ses_2', 'Good, thanks');

    const result = await indexOpencodeDatabase(targetDb, opencodeDbPath);

    expect(result.conversationsIndexed).toBe(2);
    expect(result.exchangesIndexed).toBe(2);
    expect(result.errors.length).toBe(0);

    const conv1 = getConversation(targetDb, 'ses_1');
    expect(conv1).toBeDefined();
    expect(conv1!.source).toBe('opencode');
    expect(conv1!.exchangeCount).toBe(1);

    const conv2 = getConversation(targetDb, 'ses_2');
    expect(conv2).toBeDefined();
    expect(conv2!.exchangeCount).toBe(1);
  });

  test('skips unchanged conversations on re-index', async () => {
    createSession('ses_1', 'Test conversation');
    createMessage('msg_u1', 'ses_1', 'user');
    createPart('prt_u1', 'msg_u1', 'ses_1', 'Hello');
    createMessage('msg_a1', 'ses_1', 'assistant', 'msg_u1');
    createPart('prt_a1', 'msg_a1', 'ses_1', 'Hi');

    // First index
    const result1 = await indexOpencodeDatabase(targetDb, opencodeDbPath);
    expect(result1.conversationsIndexed).toBe(1);

    // Second index (should skip)
    const result2 = await indexOpencodeDatabase(targetDb, opencodeDbPath);
    expect(result2.conversationsIndexed).toBe(0);
    expect(result2.conversationsSkipped).toBe(1);
  });

  test('handles empty OpenCode database', async () => {
    const result = await indexOpencodeDatabase(targetDb, opencodeDbPath);

    expect(result.conversationsIndexed).toBe(0);
    expect(result.exchangesIndexed).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  test('removes conversations from DB when sessions deleted from OpenCode', async () => {
    createSession('ses_del_1', 'Session to keep');
    createMessage('msg_u1', 'ses_del_1', 'user');
    createPart('prt_u1', 'msg_u1', 'ses_del_1', 'Hello');
    createMessage('msg_a1', 'ses_del_1', 'assistant', 'msg_u1');
    createPart('prt_a1', 'msg_a1', 'ses_del_1', 'Hi there');

    createSession('ses_del_2', 'Session to delete');
    createMessage('msg_u2', 'ses_del_2', 'user');
    createPart('prt_u2', 'msg_u2', 'ses_del_2', 'Goodbye');
    createMessage('msg_a2', 'ses_del_2', 'assistant', 'msg_u2');
    createPart('prt_a2', 'msg_a2', 'ses_del_2', 'Bye');

    // Index both sessions
    const result1 = await indexOpencodeDatabase(targetDb, opencodeDbPath);
    expect(result1.conversationsIndexed).toBe(2);
    expect(getConversation(targetDb, 'ses_del_1')).toBeDefined();
    expect(getConversation(targetDb, 'ses_del_2')).toBeDefined();

    // Delete ses_del_2 from OpenCode DB
    opencodeDb.prepare('DELETE FROM session WHERE id = ?').run('ses_del_2');

    // Re-index — should detect and remove the deleted session
    const result2 = await indexOpencodeDatabase(targetDb, opencodeDbPath);
    expect(result2.conversationsDeleted).toBe(1);
    expect(getConversation(targetDb, 'ses_del_1')).toBeDefined();
    expect(getConversation(targetDb, 'ses_del_2')).toBeUndefined();
  });

  test('handles empty conversation gracefully', async () => {
    // Create session without messages - should index with 0 exchanges
    createSession('ses_empty', 'Empty conversation');

    const result = await indexOpencodeDatabase(targetDb, opencodeDbPath);

    expect(result.conversationsIndexed).toBe(1);
    expect(result.exchangesIndexed).toBe(0);
    expect(result.errors.length).toBe(0);

    const conv = getConversation(targetDb, 'ses_empty');
    expect(conv).toBeDefined();
    expect(conv!.exchangeCount).toBe(0);
  });
});
