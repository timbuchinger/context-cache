/**
 * Tests for OpenCode conversation parser
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseOpencodeConversation } from '../opencode';

describe('OpenCode Parser', () => {
  let testDbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-opencode-${Date.now()}.db`);
    db = new Database(testDbPath);
    
    // Create minimal OpenCode schema
    db.exec(`
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
    db.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  function createTestSession(sessionId: string, title: string) {
    db.prepare(`
      INSERT INTO session (id, project_id, title, version, directory, time_created, time_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      'proj_test123',
      title,
      '1.1.40',
      '/test/dir',
      Date.now(),
      Date.now()
    );
  }

  function createTestMessage(messageId: string, sessionId: string, role: 'user' | 'assistant', parentId?: string) {
    const timeCreated = Date.now();
    
    db.prepare(`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      messageId,
      sessionId,
      timeCreated,
      timeCreated,
      JSON.stringify({
        role,
        time: { created: timeCreated },
        parentID: parentId || null,
      })
    );
  }

  function createTestPart(partId: string, messageId: string, sessionId: string, text: string) {
    db.prepare(`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      partId,
      messageId,
      sessionId,
      Date.now(),
      Date.now(),
      JSON.stringify({
        type: 'text',
        text: text,
      })
    );
  }

  test('parses single exchange from OpenCode database', async () => {
    const sessionId = 'ses_test123';
    createTestSession(sessionId, 'Test conversation');
    
    const userMsgId = 'msg_user1';
    const assistantMsgId = 'msg_assistant1';
    
    createTestMessage(userMsgId, sessionId, 'user');
    createTestPart('prt_1', userMsgId, sessionId, 'What is the weather?');
    
    createTestMessage(assistantMsgId, sessionId, 'assistant', userMsgId);
    createTestPart('prt_2', assistantMsgId, sessionId, 'It is sunny today.');

    const result = await parseOpencodeConversation(testDbPath, sessionId);

    expect(result.conversation.id).toBe(sessionId);
    expect(result.conversation.source).toBe('opencode');
    expect(result.conversation.sessionId).toBe(sessionId);
    expect(result.conversation.exchangeCount).toBe(1);
    expect(result.conversation.archivePath).toBe(testDbPath);
    
    expect(result.exchanges.length).toBe(1);
    expect(result.exchanges[0].userMessage).toBe('What is the weather?');
    expect(result.exchanges[0].assistantMessage).toBe('It is sunny today.');
    expect(result.exchanges[0].exchangeIndex).toBe(0);
  });

  test('parses multiple exchanges in correct order', async () => {
    const sessionId = 'ses_multi';
    createTestSession(sessionId, 'Multi-exchange conversation');
    
    // First exchange
    createTestMessage('msg_u1', sessionId, 'user');
    createTestPart('prt_u1', 'msg_u1', sessionId, 'First question');
    
    createTestMessage('msg_a1', sessionId, 'assistant', 'msg_u1');
    createTestPart('prt_a1', 'msg_a1', sessionId, 'First answer');
    
    // Second exchange
    createTestMessage('msg_u2', sessionId, 'user', 'msg_a1');
    createTestPart('prt_u2', 'msg_u2', sessionId, 'Second question');
    
    createTestMessage('msg_a2', sessionId, 'assistant', 'msg_u2');
    createTestPart('prt_a2', 'msg_a2', sessionId, 'Second answer');

    const result = await parseOpencodeConversation(testDbPath, sessionId);

    expect(result.exchanges.length).toBe(2);
    expect(result.exchanges[0].exchangeIndex).toBe(0);
    expect(result.exchanges[0].userMessage).toBe('First question');
    expect(result.exchanges[0].assistantMessage).toBe('First answer');
    
    expect(result.exchanges[1].exchangeIndex).toBe(1);
    expect(result.exchanges[1].userMessage).toBe('Second question');
    expect(result.exchanges[1].assistantMessage).toBe('Second answer');
  });

  test('handles message with multiple parts', async () => {
    const sessionId = 'ses_multipart';
    createTestSession(sessionId, 'Multi-part message');
    
    createTestMessage('msg_u1', sessionId, 'user');
    createTestPart('prt_1', 'msg_u1', sessionId, 'Part one. ');
    createTestPart('prt_2', 'msg_u1', sessionId, 'Part two.');
    
    createTestMessage('msg_a1', sessionId, 'assistant', 'msg_u1');
    createTestPart('prt_3', 'msg_a1', sessionId, 'Response.');

    const result = await parseOpencodeConversation(testDbPath, sessionId);

    expect(result.exchanges[0].userMessage).toBe('Part one. Part two.');
  });

  test('extracts tool calls from assistant message', async () => {
    const sessionId = 'ses_tools';
    createTestSession(sessionId, 'Conversation with tools');
    
    createTestMessage('msg_u1', sessionId, 'user');
    createTestPart('prt_u1', 'msg_u1', sessionId, 'Use a tool');
    
    const assistantData = {
      role: 'assistant',
      time: { created: Date.now() },
      parentID: 'msg_u1',
      finish: 'tool-calls',
    };
    
    db.prepare(`
      INSERT INTO message (id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?)
    `).run('msg_a1', sessionId, Date.now(), Date.now(), JSON.stringify(assistantData));
    
    const partData = {
      type: 'tool-call',
      tool: 'view',
      args: { path: '/test/file' },
    };
    
    db.prepare(`
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('prt_tool', 'msg_a1', sessionId, Date.now(), Date.now(), JSON.stringify(partData));

    const result = await parseOpencodeConversation(testDbPath, sessionId);

    expect(result.exchanges[0].toolCalls).toBeDefined();
    expect(result.exchanges[0].toolCalls).toContain('view');
  });

  test('throws error when session not found', async () => {
    await expect(
      parseOpencodeConversation(testDbPath, 'nonexistent')
    ).rejects.toThrow('Session nonexistent not found');
  });

  test('handles empty conversation gracefully', async () => {
    const sessionId = 'ses_empty';
    createTestSession(sessionId, 'Empty conversation');

    const result = await parseOpencodeConversation(testDbPath, sessionId);

    expect(result.conversation.exchangeCount).toBe(0);
    expect(result.exchanges.length).toBe(0);
  });
});
