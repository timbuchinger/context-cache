/**
 * Tests for conversation indexer
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initDatabase } from '../../database/init';
import {
  indexConversationFile,
  indexConversationFiles,
  getConversation,
  getExchanges,
} from '../indexer';

describe('Conversation Indexer', () => {
  let db: Database.Database;
  let testDbPath: string;
  let testDir: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-conv-idx-${Date.now()}.db`);
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conv-idx-test-'));
    db = initDatabase(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestConversation(filename: string, sessionId: string) {
    const testFile = path.join(testDir, filename);
    const content = [
      JSON.stringify({
        type: 'session.start',
        data: {
          sessionId,
          version: 1,
          producer: 'copilot-agent',
          copilotVersion: '0.0.400',
          startTime: '2026-02-18T10:00:00Z',
        },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Test question' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Test answer' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);
    return testFile;
  }

  test('indexes single conversation file', async () => {
    const sessionId = 'test-session-1';
    const testFile = createTestConversation('conv1.jsonl', sessionId);

    await indexConversationFile(db, testFile);

    const conversation = getConversation(db, sessionId);
    expect(conversation).toBeDefined();
    expect(conversation!.sessionId).toBe(sessionId);
    expect(conversation!.source).toBe('copilot');
    expect(conversation!.exchangeCount).toBe(1);

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
    expect(exchanges[0].userMessage).toBe('Test question');
    expect(exchanges[0].assistantMessage).toBe('Test answer');
  });

  test('indexes multiple conversation files', async () => {
    const file1 = createTestConversation('conv1.jsonl', 'session-1');
    const file2 = createTestConversation('conv2.jsonl', 'session-2');

    const result = await indexConversationFiles(db, [file1, file2]);

    expect(result.conversationsIndexed).toBe(2);
    expect(result.exchangesIndexed).toBe(2);
    expect(result.errors.length).toBe(0);

    const conv1 = getConversation(db, 'session-1');
    const conv2 = getConversation(db, 'session-2');
    expect(conv1).toBeDefined();
    expect(conv2).toBeDefined();
  });

  test('handles duplicate insertions', async () => {
    const sessionId = 'test-session-dup';
    const testFile = createTestConversation('conv-dup.jsonl', sessionId);

    await indexConversationFile(db, testFile);
    await indexConversationFile(db, testFile);

    const conversation = getConversation(db, sessionId);
    expect(conversation).toBeDefined();

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
  });

  test('handles indexing errors gracefully', async () => {
    const invalidFile = path.join(testDir, 'invalid.jsonl');
    fs.writeFileSync(invalidFile, 'not valid json');

    const result = await indexConversationFiles(db, [invalidFile]);

    expect(result.conversationsIndexed).toBe(0);
    expect(result.exchangesIndexed).toBe(0);
    expect(result.errors.length).toBe(1);
  });

  test('returns exchanges in correct order', async () => {
    const testFile = path.join(testDir, 'multi-exchange.jsonl');
    const sessionId = 'multi-session';

    const content = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);
    await indexConversationFile(db, testFile);

    const exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(2);
    expect(exchanges[0].exchangeIndex).toBe(0);
    expect(exchanges[0].userMessage).toBe('First');
    expect(exchanges[1].exchangeIndex).toBe(1);
    expect(exchanges[1].userMessage).toBe('Second');
  });

  test('updates conversation correctly when re-indexed', async () => {
    const testFile = path.join(testDir, 'update-test.jsonl');
    const sessionId = 'update-session';

    // Initial conversation with 2 exchanges
    const initialContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, initialContent);
    await indexConversationFile(db, testFile);

    let exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(2);

    // Updated conversation with 3 exchanges (conversation continued)
    const updatedContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Third' },
        id: 'e6',
        timestamp: '2026-02-18T10:00:25Z',
        parentId: 'e5',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Third response' },
        id: 'e7',
        timestamp: '2026-02-18T10:00:30Z',
        parentId: 'e6',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, updatedContent);
    await indexConversationFile(db, testFile);

    exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(3);
    expect(exchanges[2].userMessage).toBe('Third');

    const conversation = getConversation(db, sessionId);
    expect(conversation!.exchangeCount).toBe(3);
  });

  test('removes conversations from DB when archive files are deleted', async () => {
    const file1 = createTestConversation('conv-del-1.jsonl', 'session-del-1');
    const file2 = createTestConversation('conv-del-2.jsonl', 'session-del-2');

    // Index both files
    await indexConversationFiles(db, [file1, file2]);
    expect(getConversation(db, 'session-del-1')).toBeDefined();
    expect(getConversation(db, 'session-del-2')).toBeDefined();

    // Delete file1 from disk
    fs.unlinkSync(file1);

    // Re-index with only file2 — file1's conversation should be pruned from DB
    const result = await indexConversationFiles(db, [file2]);
    expect(result.conversationsDeleted).toBe(1);
    expect(getConversation(db, 'session-del-1')).toBeUndefined();
    expect(getConversation(db, 'session-del-2')).toBeDefined();
  });

  test('cleans up orphaned exchanges when conversation shrinks', async () => {
    const testFile = path.join(testDir, 'shrink-test.jsonl');
    const sessionId = 'shrink-session';

    // Initial conversation with 3 exchanges
    const initialContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'First' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second response' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Third' },
        id: 'e6',
        timestamp: '2026-02-18T10:00:25Z',
        parentId: 'e5',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Third response' },
        id: 'e7',
        timestamp: '2026-02-18T10:00:30Z',
        parentId: 'e6',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, initialContent);
    await indexConversationFile(db, testFile);

    let exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(3);

    // Updated conversation with only 1 exchange (maybe file was corrupted or truncated)
    const updatedContent = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Only one' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Only response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, updatedContent);
    await indexConversationFile(db, testFile);

    exchanges = getExchanges(db, sessionId);
    expect(exchanges.length).toBe(1);
    expect(exchanges[0].userMessage).toBe('Only one');

    const conversation = getConversation(db, sessionId);
    expect(conversation!.exchangeCount).toBe(1);
  });
});
