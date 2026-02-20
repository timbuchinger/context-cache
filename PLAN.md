# Context Cache Implementation Plan

## Overview

Context Cache is a memory storage and retrieval system for AI coding agents. It indexes markdown notes from `~/git/knowledge-base/` into SQLite with vector embeddings, providing hybrid search (BM25 + vector) via an MCP server.

## Architecture

### Components

1. **MCP Server** - Provides search interface to AI agents
2. **Indexing Job** - Processes markdown files, generates embeddings, stores in SQLite
3. **SQLite Database** - Stores files, chunks, embeddings, and BM25 indexes
4. **Search Service** - Implements hybrid search with RRF (Reciprocal Rank Fusion)

### Technology Stack

- **Language**: TypeScript
- **Database**: SQLite with sqlite-vec extension
- **Embeddings**: OpenAI or local embedding model
- **MCP**: @modelcontextprotocol/sdk
- **BM25**: Custom implementation or library (e.g., natural, js-bm25)
- **Chunking**: LangChain or custom chunker

## Database Schema

### Tables

```sql
-- Files table: tracks indexed files and their hashes
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT UNIQUE NOT NULL,
  hash TEXT NOT NULL,
  indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Chunks table: stores text chunks from files
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  embedding BLOB,
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
  UNIQUE(file_id, chunk_index)
);

-- BM25 virtual table for full-text search
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content_rowid=chunk_id
);
```

## Implementation Workplan

### Phase 1: Project Setup

- [ ] Initialize npm project with TypeScript
- [ ] Set up directory structure
  - [ ] `src/mcp-server/` - MCP server implementation
  - [ ] `src/indexer/` - Indexing job implementation
  - [ ] `src/search/` - Search and RRF logic
  - [ ] `src/database/` - Database schema and utilities
  - [ ] `src/shared/` - Shared types and utilities
- [ ] Configure TypeScript (tsconfig.json)
- [ ] Install dependencies:
  - [ ] `@modelcontextprotocol/sdk`
  - [ ] `better-sqlite3` or `sqlite3`
  - [ ] `@anthropic-ai/sdk` or embedding provider SDK
  - [ ] Chunking library
  - [ ] BM25 library or implementation
- [ ] Set up sqlite-vec extension

### Phase 2: Database Layer

- [ ] Create database initialization script
  - [ ] Define schema in SQL
  - [ ] Create indexes on file paths, hashes
  - [ ] Initialize FTS5 table for BM25
  - [ ] Set up sqlite-vec for vector similarity
- [ ] Implement database utility functions
  - [ ] Connection management
  - [ ] File CRUD operations
  - [ ] Chunk CRUD operations
  - [ ] Transaction helpers

### Phase 3: Indexer Implementation

- [ ] File discovery and hashing
  - [ ] Recursive directory traversal of `~/git/knowledge-base/`
  - [ ] SHA256 hash computation for each markdown file
  - [ ] Compare hash against database to detect changes
- [ ] File processing
  - [ ] Read markdown files
  - [ ] Chunk text into overlapping segments (e.g., 500 tokens, 50 token overlap)
  - [ ] Handle markdown structure (headers, code blocks, lists)
- [ ] Embedding generation
  - [ ] Batch embedding API calls for efficiency
  - [ ] Convert embeddings to BLOB format for sqlite-vec
  - [ ] Store embeddings with chunks
- [ ] Database updates
  - [ ] Delete old chunks for changed files (by file_id)
  - [ ] Insert new file records with updated hashes
  - [ ] Insert chunks with embeddings
  - [ ] Update FTS5 table for BM25
- [ ] Indexer CLI
  - [ ] Accept command-line arguments (e.g., `--force` to re-index all)
  - [ ] Progress logging
  - [ ] Error handling and reporting

### Phase 4: Search Implementation

- [ ] BM25 search
  - [ ] Query FTS5 table with search terms
  - [ ] Return scored results with chunk IDs
- [ ] Vector search
  - [ ] Query sqlite-vec with embedding of search query
  - [ ] Return cosine similarity scores with chunk IDs
- [ ] Reciprocal Rank Fusion (RRF)
  - [ ] Combine BM25 and vector search results
  - [ ] Apply RRF formula: `score = Σ(1 / (k + rank))` where k=60
  - [ ] Merge and re-rank results
  - [ ] Return top N results
- [ ] Result formatting
  - [ ] Include chunk content
  - [ ] Include source file path
  - [ ] Include relevance score
  - [ ] Format as structured JSON

### Phase 5: MCP Server Implementation

- [ ] Set up MCP server with SDK
  - [ ] Initialize server with proper capabilities
  - [ ] Register tools/resources
- [ ] Implement search tool
  - [ ] Tool name: `search_notes` or `search_memory`
  - [ ] Parameters:
    - [ ] `query` (string, required) - Search query
    - [ ] `limit` (number, optional) - Max results (default: 10)
  - [ ] Response schema:
    ```json
    {
      "results": [
        {
          "content": "chunk content",
          "source_path": "relative/path/to/file.md",
          "score": 0.95,
          "chunk_index": 0
        }
      ]
    }
    ```
- [ ] Server lifecycle management
  - [ ] Startup: initialize database connection
  - [ ] Shutdown: close connections gracefully
- [ ] Error handling and validation

### Phase 6: Configuration and Deployment

- [ ] Configuration file
  - [ ] Database path (default: `~/.context-cache/db.sqlite`)
  - [ ] Knowledge base path (default: `~/git/knowledge-base/`)
  - [ ] Embedding model/provider settings
  - [ ] Chunking parameters
  - [ ] Search parameters (RRF k value, result limits)
- [ ] Environment variables support
  - [ ] API keys for embedding provider
  - [ ] Override config paths
- [ ] Build scripts
  - [ ] `npm run build` - Compile TypeScript
  - [ ] `npm run indexer` - Run indexing job
  - [ ] `npm run server` - Start MCP server
- [ ] Setup script
  - [ ] Initialize database
  - [ ] Run initial indexing
  - [ ] Verify sqlite-vec installation

### Phase 7: Testing and Documentation

- [ ] Unit tests
  - [ ] Database operations
  - [ ] Chunking logic
  - [ ] RRF algorithm
- [ ] Integration tests
  - [ ] End-to-end indexing
  - [ ] Search accuracy
- [ ] Documentation
  - [ ] README.md with setup instructions
  - [ ] Architecture documentation
  - [ ] API/tool documentation for MCP
  - [ ] Cron setup example
- [ ] Example cron job
  ```cron
  # Re-index every hour
  0 * * * * cd ~/git/context-cache && npm run indexer
  ```

## Technical Considerations

### Chunking Strategy

- **Chunk size**: 400-600 tokens (adjust based on embedding model limits)
- **Overlap**: 50-100 tokens to preserve context across chunks
- **Respect boundaries**: Try to break at paragraph or sentence boundaries
- **Preserve structure**: Include parent headers in chunk metadata

### Embedding Model

- **Options**:
  1. OpenAI `text-embedding-3-small` or `text-embedding-3-large`
  2. Local models via Ollama (e.g., nomic-embed-text)
  3. Sentence transformers
- **Dimension**: 1536 (OpenAI) or 768 (local models)
- **Cost consideration**: Batch API calls, cache embeddings

### BM25 Implementation

- Use SQLite FTS5 with `bm25()` function
- Alternatively, implement custom BM25 with tokenization
- Tune BM25 parameters (k1, b) for markdown content

### RRF Parameters

- **k value**: 60 (standard, can be tuned)
- **Weights**: Equal weighting for BM25 and vector search initially
- Can add adjustable weights: `w1/(k+r1) + w2/(k+r2)`

### Performance Optimization

- **Indexing**:
  - Batch embedding generation
  - Use transactions for bulk inserts
  - Parallel file processing (with worker threads)
- **Search**:
  - Cache embeddings for common queries
  - Limit vector search to top K candidates before RRF
  - Use prepared statements

### Error Handling

- **Indexing failures**: Log errors, continue with other files
- **Embedding API failures**: Retry with exponential backoff
- **Database errors**: Transaction rollback, detailed logging
- **MCP errors**: Return structured error responses

## Future Enhancements

- [ ] Incremental indexing (watch filesystem for changes)
- [ ] Metadata extraction (tags, frontmatter, dates)
- [ ] Filter by file path, date, or metadata
- [ ] Semantic caching of search results
- [ ] Query expansion or rewriting
- [ ] Multi-modal support (images, code)
- [ ] Web UI for search and browsing
- [ ] Export/backup functionality
- [ ] Analytics on search patterns

## File Structure

```
context-cache/
├── package.json
├── tsconfig.json
├── README.md
├── PLAN.md
├── src/
│   ├── mcp-server/
│   │   ├── index.ts           # MCP server entry point
│   │   └── tools.ts           # Tool definitions
│   ├── indexer/
│   │   ├── index.ts           # Indexer CLI entry point
│   │   ├── file-processor.ts # File discovery and hashing
│   │   ├── chunker.ts         # Text chunking logic
│   │   └── embedder.ts        # Embedding generation
│   ├── search/
│   │   ├── bm25.ts            # BM25 search implementation
│   │   ├── vector.ts          # Vector search implementation
│   │   └── rrf.ts             # RRF merging logic
│   ├── database/
│   │   ├── schema.sql         # Database schema
│   │   ├── init.ts            # Database initialization
│   │   └── operations.ts      # CRUD operations
│   └── shared/
│       ├── types.ts           # Shared TypeScript types
│       ├── config.ts          # Configuration management
│       └── utils.ts           # Utility functions
└── scripts/
    └── setup.sh               # Initial setup script
```

## Getting Started

1. **Install dependencies**: `npm install`
2. **Set up database**: `npm run setup`
3. **Run initial indexing**: `npm run indexer`
4. **Start MCP server**: `npm run server`
5. **Configure cron**: Add indexer to crontab

## Success Criteria

- [ ] Successfully indexes all markdown files in `~/git/knowledge-base/`
- [ ] Detects file changes via hash comparison
- [ ] Generates embeddings and stores them in SQLite
- [ ] MCP server responds to search queries
- [ ] Hybrid search returns relevant results with proper ranking
- [ ] Results include chunk content and source file paths
- [ ] Indexer can be run via cron without issues
- [ ] Documentation is complete and setup is straightforward
