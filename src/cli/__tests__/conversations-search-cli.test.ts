/**
 * Tests for conversations-search-cli
 *
 * Regression: the CLI previously used a hardcoded path
 * (~/.context-cache/context-cache.db) instead of getConfig('databasePath'),
 * causing it to search the wrong database and return no results.
 */

import { jest } from '@jest/globals';

// Capture the db path passed to initDatabase
let capturedDbPath: string | undefined;

jest.mock('../../database/init', () => ({
  initDatabase: jest.fn((dbPath: string) => {
    capturedDbPath = dbPath;
    // Return a minimal stub that won't throw
    return {
      close: jest.fn(),
      prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn() })),
    };
  }),
}));

jest.mock('../../conversations/search', () => ({
  searchConversations: jest.fn(async () => []),
}));

jest.mock('../../shared/config', () => ({
  getConfig: jest.fn((key: string) => {
    if (key === 'databasePath') return '/mocked/path/db.sqlite';
    return undefined;
  }),
}));

describe('conversations-search-cli database path', () => {
  beforeEach(() => {
    capturedDbPath = undefined;
    jest.clearAllMocks();
    // Provide a query argument so the CLI doesn't exit early
    process.argv = ['node', 'conversations-search-cli.js', 'test query'];
  });

  test('uses getConfig("databasePath") not a hardcoded path', async () => {
    // Import after mocks are set up; use jest.isolateModules to reset module state
    await jest.isolateModulesAsync(async () => {
      // Prevent process.exit from killing the test runner
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

      await import('../conversations-search-cli');

      // Allow any pending promises to settle
      await new Promise(resolve => setImmediate(resolve));

      expect(capturedDbPath).toBe('/mocked/path/db.sqlite');
      exitSpy.mockRestore();
    });
  });
});
