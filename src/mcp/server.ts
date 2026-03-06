import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { initDatabase } from '../database/init';
import { hybridSearch } from '../search/hybrid';
import { createEmbedder } from '../indexer/embedder';
import { searchConversations, formatConversationResults } from '../conversations/search';
import { showConversationByPath } from '../conversations/show';

export interface MCPServer {
  listTools(): Promise<Array<{ name: string; description: string; inputSchema: any }>>;
  callTool(name: string, args: any): Promise<{ content: Array<{ type: string; text: string }> }>;
  close(): Promise<void>;
}

class MCPServerImpl implements MCPServer {
  private server: Server;
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.server = new Server(
      {
        name: 'context-cache',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'kb_search',
          description: 'Search through notes using hybrid search (BM25 + vector embeddings). Returns results ranked by relevance score (higher score = more relevant). Scores are typically 0.01-0.05, where items appearing in both keyword and semantic searches rank higher.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return (default: 10)',
              },
              minScore: {
                type: 'number',
                description: 'Minimum relevance score threshold (default: 0.01). Use lower values for broader results, higher values for stricter filtering.',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'conversations_search',
          description: 'Search through AI assistant conversation history',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10)',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'conversation_show',
          description: 'Display a full conversation',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to conversation file',
              },
            },
            required: ['path'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name === 'kb_search') {
        const { query, limit = 10, minScore = 0.01 } = request.params.arguments as { query: string; limit?: number; minScore?: number };

        const db = new Database(this.dbPath);
        try {
          const embedder = await createEmbedder();
          const queryEmbedding = await embedder.generateEmbedding(query);

          const results = await hybridSearch(db, query, queryEmbedding, limit, minScore);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  results: results.map((r) => ({
                    file_path: r.source_path,
                    chunk_index: r.chunk_index,
                    content: r.content,
                    score: r.score,
                  })),
                }),
              },
            ],
          };
        } finally {
          db.close();
        }
      }

      if (request.params.name === 'conversations_search') {
        const { query, limit = 10 } = request.params.arguments as { query: string; limit?: number };

        const db = new Database(this.dbPath);
        try {
          let queryEmbedding: number[] | undefined;
          try {
            const embedder = await createEmbedder();
            queryEmbedding = await embedder.generateEmbedding(query);
          } catch { /* fall back to BM25 only */ }

          const results = await searchConversations(db, query, { limit, queryEmbedding });
          const formatted = formatConversationResults(results, 'markdown');

          return {
            content: [
              {
                type: 'text',
                text: formatted,
              },
            ],
          };
        } finally {
          db.close();
        }
      }

      if (request.params.name === 'conversation_show') {
        const { path } = request.params.arguments as { path: string };

        try {
          const formatted = showConversationByPath(path);

          return {
            content: [
              {
                type: 'text',
                text: formatted,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: ${error}`,
              },
            ],
          };
        }
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    });
  }

  async listTools() {
    return [
      {
        name: 'kb_search',
        description: 'Search through notes using hybrid search (BM25 + vector embeddings)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'conversations_search',
        description: 'Search through AI assistant conversation history',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'conversation_show',
        description: 'Display a full conversation',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to conversation file',
            },
          },
          required: ['path'],
        },
      },
    ];
  }

  async callTool(name: string, args: any) {
    // Directly call the handler logic
    if (name === 'kb_search') {
      const { query, limit = 10 } = args as { query: string; limit?: number };

      const db = initDatabase(this.dbPath);
      try {
        const embedder = await createEmbedder();
        const queryEmbedding = await embedder.generateEmbedding(query);

        const results = await hybridSearch(db, query, queryEmbedding, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: results.map((r) => ({
                  file_path: r.source_path,
                  chunk_index: r.chunk_index,
                  content: r.content,
                  score: r.score,
                })),
              }),
            },
          ],
        };
      } finally {
        db.close();
      }
    }

    if (name === 'conversations_search') {
      const { query, limit = 10 } = args as { query: string; limit?: number };

      const db = initDatabase(this.dbPath);
      try {
        let queryEmbedding: number[] | undefined;
        try {
          const embedder = await createEmbedder();
          queryEmbedding = await embedder.generateEmbedding(query);
        } catch { /* fall back to BM25 only */ }

        const results = await searchConversations(db, query, { limit, queryEmbedding });
        const formatted = formatConversationResults(results, 'json');

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      } finally {
        db.close();
      }
    }

    if (name === 'conversation_show') {
      const { path } = args as { path: string };

      try {
        const formatted = showConversationByPath(path);

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error}`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  async close() {
    await this.server.close();
  }
}

export function createMCPServer(dbPath: string): MCPServer {
  return new MCPServerImpl(dbPath);
}

export interface ServerOptions {
  mode?: 'stdio' | 'http';
  port?: number;
}

function setupHandlers(server: Server, dbPath: string): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'kb_search',
        description: 'Search through notes using hybrid search (BM25 + vector embeddings)',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'conversations_search',
        description: 'Search through AI assistant conversation history. Use BEFORE tasks to recover past decisions, solutions, and context. Returns exchanges matching the query with timestamps and file paths.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query to find in conversation exchanges',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results to return (default: 10)',
            },
            after: {
              type: 'string',
              description: 'Only return conversations after this date (ISO format: YYYY-MM-DD)',
            },
            before: {
              type: 'string',
              description: 'Only return conversations before this date (ISO format: YYYY-MM-DD)',
            },
            response_format: {
              type: 'string',
              enum: ['markdown', 'json'],
              description: 'Output format: "markdown" for human-readable or "json" for machine-readable (default: markdown)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'conversation_show',
        description: 'Display a full conversation from a file path. Use after conversations_search to read complete context. Supports pagination with startLine/endLine (1-indexed).',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the conversation file (from search results)',
            },
            startLine: {
              type: 'number',
              description: 'Starting exchange number (1-indexed, inclusive). Omit to start from beginning.',
            },
            endLine: {
              type: 'number',
              description: 'Ending exchange number (1-indexed, inclusive). Omit to read to end.',
            },
          },
          required: ['path'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'kb_search') {
      const { query, limit = 10 } = request.params.arguments as { query: string; limit?: number };

      const db = initDatabase(dbPath);
      try {
        const embedder = await createEmbedder();
        const queryEmbedding = await embedder.generateEmbedding(query);

        const results = await hybridSearch(db, query, queryEmbedding, limit);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                results: results.map((r) => ({
                  file_path: r.source_path,
                  chunk_index: r.chunk_index,
                  content: r.content,
                  score: r.score,
                })),
              }),
            },
          ],
        };
      } finally {
        db.close();
      }
    }

    if (request.params.name === 'conversations_search') {
      const {
        query,
        limit = 10,
        after,
        before,
        response_format = 'markdown'
      } = request.params.arguments as {
        query: string;
        limit?: number;
        after?: string;
        before?: string;
        response_format?: 'markdown' | 'json';
      };

      const db = initDatabase(dbPath);
      try {
        let queryEmbedding: number[] | undefined;
        try {
          const embedder = await createEmbedder();
          queryEmbedding = await embedder.generateEmbedding(query);
        } catch { /* fall back to BM25 only */ }

        const results = await searchConversations(db, query, { limit, after, before, queryEmbedding });
        const formatted = formatConversationResults(results, response_format);

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      } finally {
        db.close();
      }
    }

    if (request.params.name === 'conversation_show') {
      const {
        path,
        startLine,
        endLine
      } = request.params.arguments as {
        path: string;
        startLine?: number;
        endLine?: number;
      };

      try {
        const formatted = showConversationByPath(path, { startLine, endLine });

        return {
          content: [
            {
              type: 'text',
              text: formatted,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error reading conversation: ${error}`,
            },
          ],
        };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });
}

export async function runMCPServer(dbPath: string, options?: ServerOptions): Promise<void> {
  const { mode = 'stdio', port = 3000 } = options || {};

  const server = new Server(
    {
      name: 'context-cache',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  setupHandlers(server, dbPath);

  if (mode === 'http') {
    const app = createMcpExpressApp({ host: '0.0.0.0' });

    // Streamable HTTP transport (MCP spec 2024-11-05+)
    const streamableTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => require('crypto').randomUUID(),
    });

    // Pass req.body explicitly — Express json() middleware already consumed the
    // stream, so the transport must receive the pre-parsed body.
    app.post('/mcp', (req: Request, res: Response) => {
      streamableTransport.handleRequest(req, res, req.body);
    });

    app.get('/mcp', (req: Request, res: Response) => {
      streamableTransport.handleRequest(req, res);
    });

    app.delete('/mcp', (req: Request, res: Response) => {
      streamableTransport.handleRequest(req, res);
    });

    await server.connect(streamableTransport);

    // Legacy SSE transport (widely supported by AI agents)
    // GET /sse  — client opens SSE stream
    // POST /messages — client sends JSON-RPC messages
    const sseTransports: Record<string, SSEServerTransport> = {};

    app.get('/sse', async (req: Request, res: Response) => {
      const transport = new SSEServerTransport('/messages', res);
      sseTransports[transport.sessionId] = transport;

      transport.onclose = () => {
        delete sseTransports[transport.sessionId];
      };

      // Create a fresh Server instance per SSE session
      const sseServer = new Server(
        { name: 'context-cache', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      setupHandlers(sseServer, dbPath);
      await sseServer.connect(transport);
    });

    app.post('/messages', async (req: Request, res: Response) => {
      const sessionId = req.query['sessionId'] as string;
      const transport = sseTransports[sessionId];
      if (!transport) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }
      await transport.handlePostMessage(req, res, req.body);
    });

    return new Promise<void>((resolve, reject) => {
      const httpServer = app.listen(port, '0.0.0.0', () => {
        console.error(`MCP Server listening on http://0.0.0.0:${port}`);
        console.error(`  Streamable HTTP: POST/GET http://0.0.0.0:${port}/mcp`);
        console.error(`  Legacy SSE:      GET  http://0.0.0.0:${port}/sse`);
      });

      httpServer.on('error', reject);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
