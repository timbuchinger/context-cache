# Configuration Guide

Complete reference for configuring Context Cache.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Default Configuration](#default-configuration)
- [Configuration Priority](#configuration-priority)
- [Common Configurations](#common-configurations)

## Environment Variables

Context Cache can be configured using environment variables. All variables are optional and have sensible defaults.

### Database Configuration

#### `CONTEXT_CACHE_DB_PATH`

Path to the SQLite database file.

**Default:** `~/git/knowledge-base/db.sqlite`

**Example:**
```bash
export CONTEXT_CACHE_DB_PATH="/custom/path/notes.db"
```

### Knowledge Base Configuration

#### `CONTEXT_CACHE_KB_PATH`

Path to the directory containing markdown files to index.

**Default:** `~/git/knowledge-base`

**Example:**
```bash
export CONTEXT_CACHE_KB_PATH="/home/user/Documents/notes"
```

### Chunking Configuration

#### `CONTEXT_CACHE_CHUNK_SIZE`

Number of words per text chunk. Larger chunks provide more context but reduce granularity.

**Default:** `500`

**Range:** 100-2000 (recommended)

**Example:**
```bash
export CONTEXT_CACHE_CHUNK_SIZE="750"
```

**When to adjust:**
- **Smaller (200-400):** For code snippets, short notes
- **Default (500):** For most markdown documentation
- **Larger (800-1000):** For long-form prose, articles

#### `CONTEXT_CACHE_CHUNK_OVERLAP`

Number of words that overlap between consecutive chunks. Prevents important information from being split across chunk boundaries.

**Default:** `50`

**Range:** 0-200 (recommended)

**Example:**
```bash
export CONTEXT_CACHE_CHUNK_OVERLAP="100"
```

**Rule of thumb:** 10% of chunk size

### Embedding Configuration

#### `CONTEXT_CACHE_EMBEDDING_MODEL`

Hugging Face model for generating embeddings.

**Default:** `Xenova/all-MiniLM-L6-v2`

**Supported models:**
- `Xenova/all-MiniLM-L6-v2` (384 dimensions, fast, recommended)
- `Xenova/all-mpnet-base-v2` (768 dimensions, more accurate, slower)
- Any sentence-transformers model on Hugging Face

**Example:**
```bash
export CONTEXT_CACHE_EMBEDDING_MODEL="Xenova/all-mpnet-base-v2"
```

**Note:** Changing the model requires re-indexing all files.

### Search Configuration

#### `CONTEXT_CACHE_SEARCH_LIMIT`

Default number of search results to return.

**Default:** `10`

**Example:**
```bash
export CONTEXT_CACHE_SEARCH_LIMIT="20"
```

#### `CONTEXT_CACHE_RRF_K`

The `k` parameter for Reciprocal Rank Fusion. Higher values give more weight to lower-ranked results.

**Default:** `60`

**Range:** 1-100 (recommended 50-70)

**Example:**
```bash
export CONTEXT_CACHE_RRF_K="50"
```

**When to adjust:**
- **Lower (40-50):** Emphasize top results
- **Higher (70-80):** More balanced fusion

## Default Configuration

Complete default configuration:

```typescript
{
  // Database
  databasePath: "~/git/knowledge-base/db.sqlite",
  
  // Knowledge Base
  knowledgeBasePath: "~/git/knowledge-base",
  
  // Chunking
  chunkSize: 500,
  chunkOverlap: 50,
  
  // Embedding
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  embeddingDimension: 384,
  
  // Search
  searchLimit: 10,
  rrfK: 60
}
```

## Configuration Priority

Configuration is loaded in the following order (highest priority first):

1. **Programmatic Configuration** - Passed directly to functions
2. **Environment Variables** - Set in shell or `.env` file
3. **Default Values** - Built-in defaults

Example:

```typescript
// 1. Default: ~/git/knowledge-base/db.sqlite

// 2. Environment variable overrides default
export CONTEXT_CACHE_DB_PATH="/custom/db.sqlite"

// 3. Programmatic configuration overrides both
const config = loadConfig({
  databasePath: "/override/db.sqlite"
});
```

## Common Configurations

### Configuration 1: Default Setup

Perfect for most users. Just create the directory:

```bash
mkdir -p ~/git/knowledge-base
# Add your markdown files
# No environment variables needed
```

### Configuration 2: Custom Location

Store notes and database in a custom location:

```bash
# In ~/.bashrc or ~/.zshrc
export CONTEXT_CACHE_KB_PATH="$HOME/Documents/MyNotes"
export CONTEXT_CACHE_DB_PATH="$HOME/Documents/MyNotes/.db/notes.db"
```

### Configuration 3: Multiple Knowledge Bases

Use different databases for different projects:

```bash
# Project 1
export CONTEXT_CACHE_KB_PATH="$HOME/projects/project1/docs"
export CONTEXT_CACHE_DB_PATH="$HOME/projects/project1/.vault.db"
cc-kb-search "API docs"

# Project 2
export CONTEXT_CACHE_KB_PATH="$HOME/projects/project2/docs"
export CONTEXT_CACHE_DB_PATH="$HOME/projects/project2/.vault.db"
cc-kb-search "API docs"
```

Or use shell functions:

```bash
# In ~/.bashrc
function vault-project1() {
  CONTEXT_CACHE_DB_PATH="$HOME/proj1/.db" \
  CONTEXT_CACHE_KB_PATH="$HOME/proj1/docs" \
  cc-kb-search "$@"
}

function vault-project2() {
  CONTEXT_CACHE_DB_PATH="$HOME/proj2/.db" \
  CONTEXT_CACHE_KB_PATH="$HOME/proj2/docs" \
  cc-kb-search "$@"
}

# Usage
vault-project1 "database schema"
vault-project2 "API endpoints"
```

### Configuration 4: Code Snippets Focus

Optimize for code snippets and technical notes:

```bash
export CONTEXT_CACHE_CHUNK_SIZE="300"
export CONTEXT_CACHE_CHUNK_OVERLAP="30"
export CONTEXT_CACHE_SEARCH_LIMIT="15"
```

### Configuration 5: Long-Form Content

Optimize for articles and long-form documentation:

```bash
export CONTEXT_CACHE_CHUNK_SIZE="800"
export CONTEXT_CACHE_CHUNK_OVERLAP="80"
```

### Configuration 6: High Accuracy

Use a more accurate (but slower) embedding model:

```bash
export CONTEXT_CACHE_EMBEDDING_MODEL="Xenova/all-mpnet-base-v2"
export CONTEXT_CACHE_CHUNK_SIZE="600"
```

**Note:** Requires re-indexing all files.

## Configuration File (Future)

While Context Cache currently uses environment variables, a configuration file may be added in the future:

```yaml
# context-cache.config.yml (not yet implemented)
database:
  path: ~/git/knowledge-base/db.sqlite

knowledgeBase:
  path: ~/git/knowledge-base
  
chunking:
  size: 500
  overlap: 50
  
embedding:
  model: Xenova/all-MiniLM-L6-v2
  
search:
  defaultLimit: 10
  rrfK: 60
```

## Programmatic Configuration

For advanced usage, you can configure Context Cache programmatically:

```typescript
import { loadConfig } from './shared/config';

const config = loadConfig({
  databasePath: '/custom/db.sqlite',
  knowledgeBasePath: '/custom/notes',
  chunkSize: 750,
  chunkOverlap: 75
});

// Use config
console.log(config.databasePath);
```

## Validating Configuration

Check your current configuration:

```bash
# View effective database path
cc-stats

# Output shows:
# Database: ~/git/knowledge-base/db.sqlite
```

Or programmatically:

```typescript
import { getConfig } from './shared/config';

console.log('Database:', getConfig('databasePath'));
console.log('KB Path:', getConfig('knowledgeBasePath'));
console.log('Chunk Size:', getConfig('chunkSize'));
```

## Configuration Tips

1. **Start with Defaults:** The defaults work well for most use cases

2. **Adjust Incrementally:** Change one setting at a time and measure impact

3. **Test After Changes:** Run searches to verify behavior

4. **Document Custom Settings:** Keep notes on why you changed settings

5. **Re-index After Changes:** Some changes require re-indexing:
   - Embedding model
   - Chunk size
   - Chunk overlap

## Next Steps

- [Usage Guide](USAGE.md) - Learn how to use the tools
- [Troubleshooting](TROUBLESHOOTING.md) - Solve configuration issues
- [Architecture](ARCHITECTURE.md) - Understand the system
