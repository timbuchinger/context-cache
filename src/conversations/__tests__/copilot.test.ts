/**
 * Tests for GitHub Copilot parser
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseCopilotConversation } from '../parsers/copilot';

describe('Copilot Parser', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-parser-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('parses basic conversation with single exchange', async () => {
    const testFile = path.join(testDir, 'test-session.jsonl');
    const sessionId = 'test-session-123';
    
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
        id: 'event-1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Hello, how do I add a function?' },
        id: 'event-2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'event-1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'I can help you add a function. Here is an example...' },
        id: 'event-3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'event-2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    const result = await parseCopilotConversation(testFile);

    expect(result.conversation.id).toBe(sessionId);
    expect(result.conversation.source).toBe('copilot');
    expect(result.conversation.sessionId).toBe(sessionId);
    expect(result.conversation.copilotVersion).toBe('0.0.400');
    expect(result.conversation.exchangeCount).toBe(1);

    expect(result.exchanges.length).toBe(1);
    expect(result.exchanges[0].userMessage).toBe('Hello, how do I add a function?');
    expect(result.exchanges[0].assistantMessage).toBe(
      'I can help you add a function. Here is an example...'
    );
    expect(result.exchanges[0].exchangeIndex).toBe(0);
  });

  test('parses conversation with multiple exchanges', async () => {
    const testFile = path.join(testDir, 'test-multi.jsonl');
    const sessionId = 'multi-session-456';
    
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
        data: { content: 'First question' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'First answer' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Second question' },
        id: 'e4',
        timestamp: '2026-02-18T10:00:15Z',
        parentId: 'e3',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Second answer' },
        id: 'e5',
        timestamp: '2026-02-18T10:00:20Z',
        parentId: 'e4',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    const result = await parseCopilotConversation(testFile);

    expect(result.exchanges.length).toBe(2);
    expect(result.exchanges[0].userMessage).toBe('First question');
    expect(result.exchanges[0].assistantMessage).toBe('First answer');
    expect(result.exchanges[1].userMessage).toBe('Second question');
    expect(result.exchanges[1].assistantMessage).toBe('Second answer');
  });

  test('handles malformed JSON gracefully', async () => {
    const testFile = path.join(testDir, 'test-malformed.jsonl');
    const sessionId = 'malformed-session';
    
    const content = [
      JSON.stringify({
        type: 'session.start',
        data: { sessionId, copilotVersion: '0.0.400', startTime: '2026-02-18T10:00:00Z' },
        id: 'e1',
        timestamp: '2026-02-18T10:00:00Z',
        parentId: null,
      }),
      '{ this is not valid json }',
      JSON.stringify({
        type: 'user.message',
        data: { content: 'Valid message' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
      JSON.stringify({
        type: 'assistant.message',
        data: { content: 'Valid response' },
        id: 'e3',
        timestamp: '2026-02-18T10:00:10Z',
        parentId: 'e2',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    const result = await parseCopilotConversation(testFile);

    expect(result.exchanges.length).toBe(1);
    expect(result.exchanges[0].userMessage).toBe('Valid message');
  });

  test('throws error when no session.start event', async () => {
    const testFile = path.join(testDir, 'test-no-session.jsonl');
    
    const content = JSON.stringify({
      type: 'user.message',
      data: { content: 'Message without session' },
      id: 'e1',
      timestamp: '2026-02-18T10:00:00Z',
      parentId: null,
    });

    fs.writeFileSync(testFile, content);

    await expect(parseCopilotConversation(testFile)).rejects.toThrow(
      'No session.start event found'
    );
  });

  test('skips exchanges without assistant response', async () => {
    const testFile = path.join(testDir, 'test-incomplete.jsonl');
    const sessionId = 'incomplete-session';
    
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
        data: { content: 'Incomplete exchange' },
        id: 'e2',
        timestamp: '2026-02-18T10:00:05Z',
        parentId: 'e1',
      }),
    ].join('\n');

    fs.writeFileSync(testFile, content);

    const result = await parseCopilotConversation(testFile);

    expect(result.exchanges.length).toBe(0);
  });
});
