# Architecture Guide

Deep dive into Context Cache's architecture, design decisions, and internals.

## Table of Contents

- [System Overview](#system-overview)
- [Components](#components)
- [Database Schema](#database-schema)
- [Search Strategy](#search-strategy)
- [Data Flow](#data-flow)
- [Design Decisions](#design-decisions)

## System Overview

Context Cache is a hybrid search system that combines keyword-based (BM25) and semantic (vector) search to find relevant content in markdown notes.

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Client Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MCP Server   │  │  Search CLI  │  │  Stats CLI   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Search Layer                          │
│  ┌────────────────┐            ┌────────────────┐      │
│  │  BM25 Search   │            │ Vector Search  │      │
│  │   (FTS5)       │            │  (Cosine Sim)  │      │
│  └────────────────┘            └────────────────┘      │
│                 │                      │               │
│                 └──────────┬───────────┘               │
│                            │                           │
│                   ┌────────────────┐                   │
│                   │  RRF Fusion    │                   │
│                   │ (Hybrid Score) │                   │
│                   └────────────────┘                   │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                  Database Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐         │
│  │  files   │  │  chunks  │  │  chunks_fts  │         │
│  │  table   │  │  table   │  │  (FTS5)      │         │
│  └──────────┘  └──────────┘  └──────────────┘         │
│       SQLite with better-sqlite3                        │
└─────────────────────────────────────────────────────────┘
                           │
┌─────────────────────────────────────────────────────────┐
│                   Indexing Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   File     │→ │   Text     │→ │ Embedding  │       │
│  │ Processor  │  │  Chunker   │  │ Generator  │       │
│  └────────────┘  └────────────┘  └────────────┘       │
│       ↓                 ↓               ↓              │
│   SHA256 Hash     500 words      384-dim vector        │
└─────────────────────────────────────────────────────────┘
                           │
                   Markdown Files
```

## Components

### 1. Database Layer

**Purpose:** Persistent storage for files, chunks, and embeddings.

**Technology:** SQLite with better-sqlite3 (synchronous, embedded)

**Key Files:**
- `src/database/init.ts` - Schema initialization
- `src/database/operations.ts` - CRUD operations
- `src/database/reset.ts` - Database reset

**Responsibilities:**
- Store file metadata and hashes
- Store text chunks and embeddings
- Provide FTS5 full-text search
- Manage data lifecycle

### 2. Indexing Layer

**Purpose:** Process markdown files into searchable chunks with embeddings.

**Key Files:**
- `src/indexer/file-processor.ts` - File discovery and hashing
- `src/indexer/chunker.ts` - Text chunking with overlap
- `src/indexer/embedder.ts` - Embedding generation
- `src/indexer/index.ts` - Orchestration

**Responsibilities:**
- Discover markdown files recursively
- Compute SHA256 hashes for change detection
- Split text into overlapping chunks
- Generate embeddings for each chunk
- Store chunks and embeddings in database

### 3. Search Layer

**Purpose:** Find relevant chunks using hybrid search.

**Key Files:**
- `src/search/bm25.ts` - Keyword search via FTS5
- `src/search/vector.ts` - Semantic search via cosine similarity
- `src/search/rrf.ts` - Reciprocal Rank Fusion
- `src/search/hybrid.ts` - Orchestration

**Responsibilities:**
- BM25 search for keyword matching
- Vector search for semantic similarity
- Combine results using RRF
- Return ranked results with scores

### 4. Client Layer

**Purpose:** User-facing interfaces for search and statistics.

**Key Files:**
- `src/mcp/server.ts` - MCP protocol server
- `src/cli/search.ts` - Search CLI
- `src/cli/stats.ts` - Statistics CLI
- Entry points: `src/mcp-server.ts`, `src/search-cli.ts`, `src/stats-cli.ts`

**Responsibilities:**
- Expose search functionality
- Format and display results
- Provide statistics and diagnostics

### 5. Shared Layer

**Purpose:** Common types, utilities, and configuration.

**Key Files:**
- `src/shared/types.ts` - TypeScript interfaces
- `src/shared/config.ts` - Configuration management

## Database Schema

### Files Table

Stores metadata for each indexed file.

```sql
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL UNIQUE,        -- Relative path from KB root
  hash TEXT NOT NULL,                -- SHA256 hash for change detection
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
- Primary key on `id`
- Unique constraint on `path`

### Chunks Table

Stores text chunks and their embeddings.

```sql
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL,          -- Foreign key to files.id
  chunk_index INTEGER NOT NULL,      -- Position in file (0-indexed)
  content TEXT NOT NULL,             -- Processed text
  raw_text TEXT NOT NULL,            -- Original text
  embedding BLOB,                    -- Float32Array as binary
  FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);
```

**Indexes:**
- Primary key on `id`
- Foreign key on `file_id`
- Composite index on `(file_id, chunk_index)`

**Embedding Format:**
- Type: `Float32Array` (32-bit floats)
- Dimensions: 384 (for all-MiniLM-L6-v2)
- Storage: Binary BLOB (~1.5KB per embedding)

### Chunks FTS5 Table

Virtual table for full-text search.

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  tokenize='porter unicode61'
);
```

**Configuration:**
- Tokenizer: Porter stemming with Unicode support
- Content-less: Points to chunks table via rowid
- Ranking: BM25 algorithm (built into FTS5)

## Search Strategy

### Why Hybrid Search?

Neither keyword nor semantic search alone is sufficient:

**BM25 (Keyword) Limitations:**
- No understanding of semantics
- Misses synonyms and related concepts
- Requires exact term matches

**Vector (Semantic) Limitations:**
- Can miss exact term matches
- Less precise for specific keywords
- Higher computational cost

**Hybrid Solution:**
- Best of both worlds
- BM25 for precision (exact matches)
- Vector for recall (related concepts)
- RRF for intelligent fusion

### Search Pipeline

1. **Query Input:** User provides search query

2. **Parallel Search:**
   - **BM25 Search:** SQLite FTS5 finds keyword matches
   - **Vector Search:** Generate query embedding, compute cosine similarity

3. **Result Fusion:** Reciprocal Rank Fusion (RRF) combines rankings
   ```
   score(doc) = Σ 1/(k + rank_i(doc))
   ```
   where k=60 (default), rank_i is position in result set i

4. **Return Results:** Top N results with combined scores

### Reciprocal Rank Fusion (RRF)

**Formula:**
```
RRF_score(d) = Σ_{r ∈ R} 1/(k + r(d))
```

**Parameters:**
- `k`: Constant (default: 60)
- `r(d)`: Rank of document d in result set r
- `R`: Set of all ranking algorithms (BM25, vector)

**Properties:**
- No score normalization required
- Robust to outliers
- Equal weight to all ranking methods
- Higher scores = better matches

**Example:**

Document appears at:
- Rank 1 in BM25 results: 1/(60+1) = 0.0164
- Rank 3 in vector results: 1/(60+3) = 0.0159
- Combined score: 0.0323

## Data Flow

### Indexing Flow

```
Markdown Files
    │
    ├─> File Processor
    │   ├─> Find all .md files recursively
    │   └─> Compute SHA256 hash
    │
    ├─> Change Detection
    │   ├─> Query database for existing file
    │   ├─> Compare hashes
    │   └─> Skip if unchanged
    │
    ├─> Chunker
    │   ├─> Split text into 500-word chunks
    │   ├─> 50-word overlap between chunks
    │   └─> Word-boundary aware
    │
    ├─> Embedder
    │   ├─> Generate 384-dim vector per chunk
    │   └─> Use Xenova/all-MiniLM-L6-v2
    │
    └─> Database Operations
        ├─> Insert/update file record
        ├─> Insert chunk records with embeddings
        └─> Populate FTS5 table
```

### Search Flow

```
User Query
    │
    ├─> Generate Query Embedding
    │   └─> Use same model as indexing
    │
    ├─> BM25 Search
    │   ├─> Query FTS5 table
    │   ├─> Get top N results
    │   └─> Rank by BM25 score
    │
    ├─> Vector Search
    │   ├─> Load all embeddings
    │   ├─> Compute cosine similarity
    │   └─> Get top N results
    │
    ├─> RRF Fusion
    │   ├─> Combine rankings
    │   ├─> Calculate RRF scores
    │   └─> Sort by score
    │
    └─> Format Results
        ├─> Look up file paths
        ├─> Include chunk index
        └─> Return SearchResult[]
```

## Design Decisions

### Why SQLite?

**Advantages:**
- Embedded (no separate server)
- ACID transactions
- Built-in FTS5 for BM25
- Fast and lightweight
- Zero configuration

**Trade-offs:**
- Single-writer limitation (not an issue for our use case)
- Limited to single machine (acceptable for personal notes)

### Why Synchronous Database Operations?

Using `better-sqlite3` (synchronous) instead of async alternatives:

**Advantages:**
- Simpler error handling
- Better performance for I/O-bound operations
- Immediate consistency
- Easier to test

**Trade-offs:**
- Blocks event loop (mitigated by fast operations)

### Why Local Embeddings?

Using `@xenova/transformers` instead of API-based embeddings:

**Advantages:**
- No API keys required
- No rate limits
- Privacy (data stays local)
- No network latency
- Offline operation

**Trade-offs:**
- First-time model download (~80MB)
- Slower than cloud APIs
- Limited to smaller models

### Why Chunking with Overlap?

**Problem:** Important information may span chunk boundaries

**Solution:** 50-word overlap (10% of 500-word chunks)

**Benefits:**
- Context preserved at boundaries
- Better search recall
- Minimal storage overhead

### Why 500-Word Chunks?

**Reasoning:**
- Balances context vs. granularity
- Works well for markdown documentation
- Fits embedding model context window
- Reasonable for display in results

**Adjustable:** Can be configured via `CONTEXT_CACHE_CHUNK_SIZE`

### Why all-MiniLM-L6-v2?

**Advantages:**
- Fast inference (important for local execution)
- Good quality (384 dimensions)
- Small model size (~80MB)
- Wide adoption in sentence-transformers

**Alternative:** `all-mpnet-base-v2` (768 dim, slower, more accurate)

## Performance Characteristics

### Indexing Performance

- **File Discovery:** O(n) files
- **Hashing:** O(m) file size
- **Chunking:** O(m) file size
- **Embedding:** O(c) chunks (slowest step)
- **Database Insert:** O(c) chunks

**Bottleneck:** Embedding generation (~100-200ms per chunk)

**Optimization:** Only reprocess changed files (hash-based)

### Search Performance

- **BM25:** O(log n) - FTS5 index lookup
- **Vector:** O(n·d) - Linear scan with dot products
  - n = number of chunks
  - d = embedding dimensions (384)
- **RRF:** O(k log k) - Merge and sort results

**Bottleneck:** Vector search scales linearly with chunks

**Acceptable for:** Up to ~100K chunks (typical personal knowledge base)

## Testing Architecture

Built with Test-Driven Development:

- **Unit Tests:** Each component tested in isolation
- **Integration Tests:** Components tested together
- **Mock Objects:** Minimal mocking (real database, mock embedder)
- **Temporary Files:** Each test gets fresh database
- **Cleanup:** Proper teardown of resources

**Coverage:** 100% of public functions

## Next Steps

- [API Reference](API.md) - Function signatures and usage
- [Usage Guide](USAGE.md) - Practical usage examples
- [Configuration](CONFIGURATION.md) - Tuning parameters
