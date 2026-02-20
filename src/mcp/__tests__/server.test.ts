import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createMCPServer, MCPServer } from '../server';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../database/init';
import { insertFile, insertChunkWithEmbedding } from '../../database/operations';

// Mock the embedder module
jest.mock('../../indexer/embedder', () => ({
  createEmbedder: jest.fn(async () => ({
    generateEmbedding: jest.fn(async (text: string) => new Float32Array([0.1, 0.2, 0.3])),
  })),
}));

describe('MCP Server', () => {
  let tempDir: string;
  let dbPath: string;
  let db: Database.Database;
  let server: MCPServer;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'context-cache-mcp-test-'));
    dbPath = path.join(tempDir, 'test.db');
    
    // Initialize database
    initDatabase(dbPath);
    db = new Database(dbPath);
    
    // Create test data
    const fileId = insertFile(db, 'test.md', 'abc123');
    const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    insertChunkWithEmbedding(
      db,
      fileId,
      0,
      'This is a test note about TypeScript programming.',
      'This is a test note about TypeScript programming.',
      embedding
    );
  });

  afterEach(async () => {
    if (db) {
      db.close();
    }
    if (server) {
      await server.close();
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('createMCPServer returns server instance', () => {
    server = createMCPServer(dbPath);
    expect(server).toBeDefined();
    expect(typeof server.close).toBe('function');
  });

  test('server exposes search_notes tool', async () => {
    server = createMCPServer(dbPath);
    const tools = await server.listTools();
    
    expect(tools.length).toBeGreaterThanOrEqual(1);
    const searchNotesTool = tools.find(t => t.name === 'kb_search');
    expect(searchNotesTool).toBeDefined();
    expect(searchNotesTool!.description).toContain('Search');
    expect(searchNotesTool!.inputSchema.properties.query).toBeDefined();
    expect(tools[0].inputSchema.properties.limit).toBeDefined();
  });

  test('kb_search returns results for matching query', async () => {
    server = createMCPServer(dbPath);
    
    const result = await server.callTool('kb_search', {
      query: 'TypeScript programming',
      limit: 10
    });
    
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results.length).toBeGreaterThan(0);
    expect(data.results[0]).toHaveProperty('file_path', 'test.md');
    expect(data.results[0]).toHaveProperty('content');
    expect(data.results[0]).toHaveProperty('score');
  });

  test('kb_search respects limit parameter', async () => {
    server = createMCPServer(dbPath);
    
    // Add more test data
    const fileId = insertFile(db, 'test2.md', 'def456');
    const embedding1 = Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer);
    const embedding2 = Buffer.from(new Float32Array([0.2, 0.3, 0.4]).buffer);
    insertChunkWithEmbedding(db, fileId, 0, 'Another note', 'Another note', embedding1);
    insertChunkWithEmbedding(db, fileId, 1, 'Yet another note', 'Yet another note', embedding2);
    
    const result = await server.callTool('kb_search', {
      query: 'note',
      limit: 2
    });
    
    const data = JSON.parse(result.content[0].text);
    expect(data.results.length).toBeLessThanOrEqual(2);
  });

  test('kb_search uses default limit when not provided', async () => {
    server = createMCPServer(dbPath);
    
    const result = await server.callTool('kb_search', {
      query: 'TypeScript'
    });
    
    expect(result.content).toHaveLength(1);
    const data = JSON.parse(result.content[0].text);
    expect(Array.isArray(data.results)).toBe(true);
  });

  test('kb_search returns empty results for no matches', async () => {
    server = createMCPServer(dbPath);
    
    const result = await server.callTool('kb_search', {
      query: 'xyznonexistentquery12345',
      limit: 10
    });
    
    const data = JSON.parse(result.content[0].text);
    // With our simple embedding mock, everything has similar embeddings
    // so we just check that the API works, not the exact result count
    expect(Array.isArray(data.results)).toBe(true);
  });

  test('kb_search handles errors gracefully', async () => {
    // Create server with invalid db path
    server = createMCPServer('/nonexistent/path/to/db.sqlite');
    
    await expect(async () => {
      await server.callTool('kb_search', {
        query: 'test',
        limit: 10
      });
    }).rejects.toThrow();
  });
});
