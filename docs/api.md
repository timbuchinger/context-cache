# API Reference

Complete reference for Context Cache's public functions and interfaces.

## Table of Contents

- [Types](#types)
- [Configuration](#configuration)
- [Database](#database)
- [Indexing](#indexing)
- [Search](#search)
- [MCP Server](#mcp-server)
- [CLI](#cli)

## Types

### Core Interfaces

#### `FileRecord`

Represents a file in the database.

```typescript
interface FileRecord {
  id: number;              // Auto-incrementing ID
  path: string;            // Relative path from knowledge base root
  hash: string;            // SHA256 hash for change detection
  indexed_at: string;      // ISO timestamp of first indexing
  updated_at: string;      // ISO timestamp of last update
}
```

#### `ChunkRecord`

Represents a text chunk in the database.

```typescript
interface ChunkRecord {
  id: number;              // Auto-incrementing ID
  file_id: number;         // Foreign key to files table
  chunk_index: number;     // Position in file (0-indexed)
  content: string;         // Processed text content
  raw_text: string;        // Original text before processing
  embedding: Buffer | null; // Float32Array as binary (384 floats)
}
```

#### `SearchResult`

Search result returned by all search functions.

```typescript
interface SearchResult {
  content: string;         // Text content of the chunk
  source_path: string;     // File path relative to knowledge base
  score: number;           // Relevance score (higher = better)
  chunk_index: number;     // Position of chunk in file
}
```

#### `IndexStats`

Statistics from indexing operation.

```typescript
interface IndexStats {
  filesProcessed: number;  // Total files examined
  filesAdded: number;      // New files indexed
  filesUpdated: number;    // Existing files reindexed
  filesSkipped: number;    // Unchanged files skipped
  chunksCreated: number;   // Total chunks created
  errors: string[];        // Error messages if any
}
```

#### `Embedder`

Interface for embedding generation.

```typescript
interface Embedder {
  generateEmbedding(text: string): Promise<number[]>;
}
```

## Configuration

### `loadConfig`

Load configuration with defaults, environment overrides, and custom settings.

```typescript
function loadConfig(customConfig?: Partial<Config>): Config
```

**Parameters:**
- `customConfig` - Optional custom configuration overrides

**Returns:** Complete configuration object

**Example:**
```typescript
import { loadConfig } from './shared/config';

const config = loadConfig({
  databasePath: '/custom/db.sqlite',
  chunkSize: 750
});
```

### `getConfig`

Get a specific configuration value.

```typescript
function getConfig<K extends keyof Config>(key: K): Config[K]
```

**Parameters:**
- `key` - Configuration key to retrieve

**Returns:** Configuration value

**Example:**
```typescript
import { getConfig } from './shared/config';

const dbPath = getConfig('databasePath');
const chunkSize = getConfig('chunkSize');
```

### `resetConfig`

Clear cached configuration (for testing).

```typescript
function resetConfig(): void
```

**Example:**
```typescript
import { resetConfig } from './shared/config';

resetConfig(); // Force reload on next access
```

## Database

### Initialization

#### `initDatabase`

Initialize database with schema.

```typescript
function initDatabase(dbPath: string): Database.Database
```

**Parameters:**
- `dbPath` - Path to SQLite database file (created if doesn't exist)

**Returns:** Database instance

**Example:**
```typescript
import { initDatabase } from './database/init';

const db = initDatabase('~/notes/db.sqlite');
```

### Operations

#### `getFileByPath`

Retrieve file record by path.

```typescript
function getFileByPath(
  db: Database.Database, 
  path: string
): FileRecord | undefined
```

**Parameters:**
- `db` - Database instance
- `path` - Relative file path

**Returns:** File record or undefined if not found

**Example:**
```typescript
import { getFileByPath } from './database/operations';

const file = getFileByPath(db, 'docs/api.md');
if (file) {
  console.log('File ID:', file.id);
  console.log('Hash:', file.hash);
}
```

#### `insertFile`

Insert new file record.

```typescript
function insertFile(
  db: Database.Database,
  path: string,
  hash: string
): number
```

**Parameters:**
- `db` - Database instance
- `path` - Relative file path
- `hash` - SHA256 hash of file content

**Returns:** ID of inserted file

**Example:**
```typescript
import { insertFile, computeFileHash } from './database/operations';

const hash = computeFileHash('/path/to/file.md');
const fileId = insertFile(db, 'docs/api.md', hash);
```

#### `updateFileHash`

Update file hash (for changed files).

```typescript
function updateFileHash(
  db: Database.Database,
  fileId: number,
  newHash: string
): void
```

#### `insertChunkWithEmbedding`

Insert chunk with embedding.

```typescript
function insertChunkWithEmbedding(
  db: Database.Database,
  fileId: number,
  chunkIndex: number,
  content: string,
  rawText: string,
  embedding: Buffer
): number
```

**Parameters:**
- `db` - Database instance
- `fileId` - Foreign key to files table
- `chunkIndex` - Position in file (0-indexed)
- `content` - Processed text
- `rawText` - Original text
- `embedding` - Float32Array as Buffer

**Returns:** ID of inserted chunk

**Example:**
```typescript
import { insertChunkWithEmbedding } from './database/operations';

const embedding = await embedder.generateEmbedding(text);
const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

const chunkId = insertChunkWithEmbedding(
  db,
  fileId,
  0,
  text,
  text,
  embeddingBuffer
);
```

#### `deleteChunksByFileId`

Delete all chunks for a file.

```typescript
function deleteChunksByFileId(
  db: Database.Database,
  fileId: number
): void
```

#### `resetDatabase`

Reset database to empty state.

```typescript
function resetDatabase(db: Database.Database): void
```

## Indexing

### File Processing

#### `findMarkdownFiles`

Recursively find all markdown files.

```typescript
function findMarkdownFiles(rootPath: string): string[]
```

**Parameters:**
- `rootPath` - Root directory to search

**Returns:** Array of absolute file paths

**Example:**
```typescript
import { findMarkdownFiles } from './indexer/file-processor';

const files = findMarkdownFiles('~/git/knowledge-base');
console.log(`Found ${files.length} markdown files`);
```

#### `computeFileHash`

Compute SHA256 hash of file content.

```typescript
function computeFileHash(filePath: string): string
```

**Parameters:**
- `filePath` - Absolute path to file

**Returns:** Hex-encoded SHA256 hash

**Example:**
```typescript
import { computeFileHash } from './indexer/file-processor';

const hash = computeFileHash('/path/to/file.md');
console.log('SHA256:', hash);
```

### Chunking

#### `chunkText`

Split text into overlapping chunks.

```typescript
function chunkText(
  text: string,
  chunkSize: number,
  overlap: number
): string[]
```

**Parameters:**
- `text` - Text to chunk
- `chunkSize` - Target size in words
- `overlap` - Overlap size in words

**Returns:** Array of text chunks

**Example:**
```typescript
import { chunkText } from './indexer/chunker';

const text = "Very long document...";
const chunks = chunkText(text, 500, 50);

console.log(`Split into ${chunks.length} chunks`);
```

### Embedding

#### `createEmbedder`

Create embedder instance.

```typescript
function createEmbedder(model?: string): Promise<Embedder>
```

**Parameters:**
- `model` - Optional model name (default: from config)

**Returns:** Embedder instance

**Example:**
```typescript
import { createEmbedder } from './indexer/embedder';

const embedder = await createEmbedder();
const embedding = await embedder.generateEmbedding('Hello world');

console.log('Dimensions:', embedding.length); // 384
```

### Indexer

#### `indexFiles`

Index all markdown files in knowledge base.

```typescript
function indexFiles(
  db: Database.Database,
  knowledgeBasePath: string,
  embedder: Embedder
): Promise<IndexStats>
```

**Parameters:**
- `db` - Database instance
- `knowledgeBasePath` - Root directory of markdown files
- `embedder` - Embedder instance

**Returns:** Indexing statistics

**Example:**
```typescript
import { initDatabase } from './database/init';
import { indexFiles } from './indexer/index';
import { createEmbedder } from './indexer/embedder';

const db = initDatabase('~/notes/db.sqlite');
const embedder = await createEmbedder();

const stats = await indexFiles(db, '~/git/knowledge-base', embedder);

console.log('Files added:', stats.filesAdded);
console.log('Files updated:', stats.filesUpdated);
console.log('Files skipped:', stats.filesSkipped);
console.log('Chunks created:', stats.chunksCreated);

db.close();
```

## Search

### BM25 Search

#### `bm25Search`

Full-text search using SQLite FTS5.

```typescript
function bm25Search(
  db: Database.Database,
  query: string,
  limit: number
): SearchResult[]
```

**Parameters:**
- `db` - Database instance
- `query` - Search query
- `limit` - Maximum results

**Returns:** Array of search results

**Example:**
```typescript
import { bm25Search } from './search/bm25';

const results = bm25Search(db, 'TypeScript patterns', 10);
```

### Vector Search

#### `vectorSearch`

Semantic search using cosine similarity.

```typescript
function vectorSearch(
  db: Database.Database,
  queryEmbedding: number[],
  limit: number
): Promise<SearchResult[]>
```

**Parameters:**
- `db` - Database instance
- `queryEmbedding` - Query embedding vector
- `limit` - Maximum results

**Returns:** Array of search results

**Example:**
```typescript
import { vectorSearch } from './search/vector';
import { createEmbedder } from './indexer/embedder';

const embedder = await createEmbedder();
const queryEmbedding = await embedder.generateEmbedding('TypeScript patterns');

const results = await vectorSearch(db, queryEmbedding, 10);
```

### Hybrid Search

#### `hybridSearch`

Hybrid search combining BM25 and vector search.

```typescript
function hybridSearch(
  db: Database.Database,
  query: string,
  queryEmbedding: number[],
  limit: number
): Promise<SearchResult[]>
```

**Parameters:**
- `db` - Database instance
- `query` - Search query text
- `queryEmbedding` - Query embedding vector
- `limit` - Maximum results

**Returns:** Array of search results sorted by RRF score

**Example:**
```typescript
import { hybridSearch } from './search/hybrid';
import { createEmbedder } from './indexer/embedder';

const embedder = await createEmbedder();
const query = 'TypeScript patterns';
const queryEmbedding = await embedder.generateEmbedding(query);

const results = await hybridSearch(db, query, queryEmbedding, 10);

results.forEach((result, i) => {
  console.log(`${i+1}. ${result.source_path}`);
  console.log(`   Score: ${result.score.toFixed(4)}`);
  console.log(`   ${result.content.substring(0, 100)}...`);
});
```

### RRF

#### `reciprocalRankFusion`

Merge multiple result sets using RRF.

```typescript
function reciprocalRankFusion(
  resultSets: SearchResult[][],
  k?: number
): SearchResult[]
```

**Parameters:**
- `resultSets` - Array of result arrays to merge
- `k` - RRF constant (default: 60)

**Returns:** Merged and sorted results

**Example:**
```typescript
import { reciprocalRankFusion } from './search/rrf';

const bm25Results = bm25Search(db, query, 20);
const vectorResults = await vectorSearch(db, embedding, 20);

const merged = reciprocalRankFusion([bm25Results, vectorResults], 60);
```

## MCP Server

### `createMCPServer`

Create MCP server instance (for testing).

```typescript
function createMCPServer(dbPath: string): MCPServer
```

### `runMCPServer`

Run MCP server with stdio transport.

```typescript
function runMCPServer(dbPath: string): Promise<void>
```

**Parameters:**
- `dbPath` - Path to database

**Example:**
```typescript
import { runMCPServer } from './mcp/server';

await runMCPServer('~/notes/db.sqlite');
```

## CLI

### Search CLI

#### `searchNotes`

Search function used by CLI.

```typescript
function searchNotes(
  dbPath: string,
  query: string,
  limit: number
): Promise<SearchResult[]>
```

**Parameters:**
- `dbPath` - Path to database
- `query` - Search query
- `limit` - Maximum results

**Returns:** Search results

**Example:**
```typescript
import { searchNotes } from './cli/search';

const results = await searchNotes(
  '~/notes/db.sqlite',
  'TypeScript patterns',
  10
);
```

### Stats CLI

#### `getIndexStats`

Get index statistics.

```typescript
function getIndexStats(
  dbPath: string,
  options?: { includeFiles?: boolean }
): {
  totalFiles: number;
  totalChunks: number;
  avgChunksPerFile: number;
  databaseSizeBytes: number;
  files?: string[];
}
```

**Parameters:**
- `dbPath` - Path to database
- `options.includeFiles` - Include file list

**Returns:** Statistics object

**Example:**
```typescript
import { getIndexStats } from './cli/stats';

const stats = getIndexStats('~/notes/db.sqlite', { includeFiles: true });

console.log('Total files:', stats.totalFiles);
console.log('Total chunks:', stats.totalChunks);
console.log('Database size:', stats.databaseSizeBytes);
console.log('Files:', stats.files);
```

## Error Handling

All functions may throw errors. Handle appropriately:

```typescript
try {
  const results = await hybridSearch(db, query, embedding, 10);
} catch (error) {
  console.error('Search failed:', error.message);
}
```

Common errors:
- Database not found: Check database path
- Table not found: Database not initialized
- Embedding generation failed: Model not downloaded
- File not found: Check file paths

## Next Steps

- [Usage Guide](USAGE.md) - Practical examples
- [Architecture](ARCHITECTURE.md) - System design
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues
