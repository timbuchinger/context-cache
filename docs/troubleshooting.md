# Troubleshooting Guide

Solutions to common issues and problems with Context Cache.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Database Issues](#database-issues)
- [Search Issues](#search-issues)
- [MCP Server Issues](#mcp-server-issues)
- [Performance Issues](#performance-issues)
- [Configuration Issues](#configuration-issues)

## Installation Issues

### `better-sqlite3` Won't Install

**Problem:** Native module compilation fails during `npm install`

**Solution 1: Install Build Tools**

Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install build-essential python3
npm install
```

macOS:
```bash
xcode-select --install
npm install
```

Windows:
```bash
npm install --global windows-build-tools
npm install
```

**Solution 2: Use Pre-built Binaries**

```bash
npm install better-sqlite3 --build-from-source=false
```

**Solution 3: Rebuild Native Module**

```bash
npm rebuild better-sqlite3
```

### `@xenova/transformers` Model Download Fails

**Problem:** First-time model download fails or hangs

**Symptoms:**
- Timeout errors
- Network errors
- Incomplete download

**Solution 1: Check Internet Connection**

The model (~80MB) requires internet access on first use.

**Solution 2: Manual Download**

```bash
# Download model manually
mkdir -p ~/.cache/huggingface/transformers
cd ~/.cache/huggingface/transformers

# Download from Hugging Face
wget https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
```

**Solution 3: Use Proxy**

```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
npm test  # Trigger model download
```

### TypeScript Build Fails

**Problem:** `npm run build` fails with TypeScript errors

**Solution 1: Clean and Rebuild**

```bash
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Solution 2: Check TypeScript Version**

```bash
npm list typescript
# Should be ^5.9.3
npm install typescript@5.9.3
```

**Solution 3: Check tsconfig.json**

Ensure `tsconfig.json` has correct settings:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true
  }
}
```

## Database Issues

### Database Not Found

**Problem:** CLI tools report database not found

**Symptoms:**
```
❌ Error: SQLITE_CANTOPEN: unable to open database file
```

**Solution 1: Create Database Directory**

```bash
mkdir -p ~/git/knowledge-base
```

**Solution 2: Initialize Database**

The database is created automatically on first use. Run indexing:
```typescript
import { initDatabase } from './src/database/init';
const db = initDatabase('~/git/knowledge-base/db.sqlite');
db.close();
```

**Solution 3: Check Permissions**

```bash
ls -la ~/git/knowledge-base/db.sqlite
# Should be readable and writable
chmod 644 ~/git/knowledge-base/db.sqlite
```

**Solution 4: Specify Custom Path**

```bash
export CONTEXT_CACHE_DB_PATH="/custom/path/db.sqlite"
cc-stats
```

### Database Locked

**Problem:** Database locked error

**Symptoms:**
```
Error: SQLITE_BUSY: database is locked
```

**Cause:** Another process is using the database

**Solution 1: Close Other Connections**

```bash
# Find processes using the database
lsof ~/git/knowledge-base/db.sqlite

# Kill if necessary
kill <PID>
```

**Solution 2: Wait and Retry**

SQLite locks are usually brief. Wait a few seconds and retry.

**Solution 3: Check for Stuck Transactions**

Restart any MCP servers or CLI tools that might have open connections.

### Corrupted Database

**Problem:** Database corruption errors

**Symptoms:**
```
Error: SQLITE_CORRUPT: database disk image is malformed
```

**Solution 1: Integrity Check**

```bash
sqlite3 ~/git/knowledge-base/db.sqlite "PRAGMA integrity_check;"
```

**Solution 2: Backup and Recreate**

```bash
# Backup current database
cp ~/git/knowledge-base/db.sqlite ~/git/knowledge-base/db.sqlite.backup

# Delete corrupted database
rm ~/git/knowledge-base/db.sqlite

# Re-index (if indexer CLI existed)
# For now, use programmatic indexing
```

**Solution 3: Export and Reimport**

```bash
sqlite3 ~/git/knowledge-base/db.sqlite ".dump" > backup.sql
rm ~/git/knowledge-base/db.sqlite
sqlite3 ~/git/knowledge-base/db.sqlite < backup.sql
```

## Search Issues

### No Search Results

**Problem:** Search returns no results when you expect matches

**Possible Causes:**

1. **Database Empty:** No files indexed yet
2. **Query Too Specific:** Try broader terms
3. **Wrong Database:** Using different database than indexed

**Solution 1: Check Index Status**

```bash
cc-stats
```

Output shows if database has content:
```
Total Files:      0    ← Empty database!
Total Chunks:     0
```

**Solution 2: Verify Database Location**

```bash
cc-stats
# Check the database path in output
```

**Solution 3: Try Broader Query**

```bash
# Too specific
cc-kb-search "exactly this phrase from my notes"

# Better
cc-kb-search "phrase notes"
```

**Solution 4: Re-index Files**

If files exist but no results, re-index (once indexer CLI is available).

### Poor Search Quality

**Problem:** Search returns irrelevant results

**Solution 1: Adjust Chunk Size**

Smaller chunks for more precise results:
```bash
export CONTEXT_CACHE_CHUNK_SIZE="300"
# Re-index required
```

**Solution 2: Increase Result Limit**

Get more results to find relevant ones:
```bash
cc-kb-search "query" --limit 20
```

**Solution 3: Try Different Phrasing**

```bash
# Instead of:
cc-kb-search "how do I"

# Try:
cc-kb-search "tutorial guide"
```

**Solution 4: Adjust RRF K-value**

Emphasize top results:
```bash
export CONTEXT_CACHE_RRF_K="50"  # Lower = emphasize top results
```

### Slow Search

**Problem:** Search takes too long

**Solution 1: Reduce Result Limit**

```bash
cc-kb-search "query" --limit 5  # Faster
```

**Solution 2: Check Database Size**

```bash
cc-stats
# Large database = slower vector search
```

**Solution 3: Optimize Database**

```bash
sqlite3 ~/git/knowledge-base/db.sqlite "VACUUM;"
sqlite3 ~/git/knowledge-base/db.sqlite "ANALYZE;"
```

**Solution 4: Use Faster Model**

The default model (all-MiniLM-L6-v2) is already fast. Avoid switching to larger models.

## MCP Server Issues

### Claude Desktop Can't Connect

**Problem:** Claude Desktop doesn't show `kb_search` tool

**Solution 1: Check Configuration**

Verify `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "context-cache": {
      "command": "node",
      "args": ["/absolute/path/to/context-cache/dist/mcp-server.js"]
    }
  }
}
```

**Important:** Must use absolute path, not relative or `~`.

**Solution 2: Verify Binary Exists**

```bash
ls -la /path/to/context-cache/dist/mcp-server.js
# Should exist and be readable
```

**Solution 3: Test Manually**

```bash
node /path/to/context-cache/dist/mcp-server.js
```

Should output:
```
Starting Context Cache MCP Server with database: ...
```

Press Ctrl+C to exit.

**Solution 4: Check Logs**

Claude Desktop logs (macOS):
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**Solution 5: Restart Claude Desktop**

After config changes, fully quit and restart Claude Desktop.

### MCP Server Crashes

**Problem:** MCP server starts but crashes immediately

**Solution 1: Check Database Path**

```bash
# Test with explicit path
CONTEXT_CACHE_DB_PATH="$HOME/git/knowledge-base/db.sqlite" \
  node dist/mcp-server.js
```

**Solution 2: Check Node Version**

```bash
node --version
# Should be v18.x or higher
```

**Solution 3: Review Error Messages**

Run manually to see errors:
```bash
node dist/mcp-server.js 2>&1 | tee mcp-error.log
```

### Search From Claude Returns Errors

**Problem:** Claude shows errors when using `kb_search`

**Solution 1: Check Database Exists**

```bash
ls -la ~/git/knowledge-base/db.sqlite
```

**Solution 2: Test Search CLI**

```bash
cc-kb-search "test query"
# If this works, MCP server should work
```

**Solution 3: Check MCP Server Logs**

Errors are logged to stderr, visible in Claude Desktop logs.

## Performance Issues

### Indexing Very Slow

**Problem:** Indexing takes hours for moderate-sized knowledge base

**Cause:** Embedding generation is slow (~100-200ms per chunk)

**Solution 1: Check Progress**

Monitor file processing to ensure it's progressing.

**Solution 2: Reduce Chunk Size**

Fewer chunks = faster indexing:
```bash
export CONTEXT_CACHE_CHUNK_SIZE="750"  # Larger chunks
export CONTEXT_CACHE_CHUNK_OVERLAP="75"
```

**Solution 3: Incremental Indexing**

Only changed files are reindexed. Subsequent runs are much faster.

**Expected Performance:**
- ~100-200 chunks per minute
- 10,000 chunks ≈ 50-100 minutes

### High Memory Usage

**Problem:** Process uses excessive memory

**Solution 1: Process Files in Batches**

For large knowledge bases, consider batching (requires code modification).

**Solution 2: Reduce Embedding Model Cache**

The model stays in memory. This is expected (~200MB).

**Solution 3: Check for Memory Leaks**

```bash
node --expose-gc dist/mcp-server.js
```

### Database File Too Large

**Problem:** Database file is very large

**Expected Size:** ~10-20KB per chunk
- 1,000 chunks ≈ 10-20MB
- 10,000 chunks ≈ 100-200MB

**Solution 1: Vacuum Database**

```bash
sqlite3 ~/git/knowledge-base/db.sqlite "VACUUM;"
```

**Solution 2: Check for Duplicate Data**

```bash
sqlite3 ~/git/knowledge-base/db.sqlite "SELECT COUNT(*) FROM files;"
sqlite3 ~/git/knowledge-base/db.sqlite "SELECT COUNT(*) FROM chunks;"
```

**Solution 3: Increase Chunk Size**

Larger chunks = fewer total chunks = smaller database:
```bash
export CONTEXT_CACHE_CHUNK_SIZE="750"
```

## Configuration Issues

### Environment Variables Ignored

**Problem:** Settings don't change when environment variables are set

**Solution 1: Export Variables**

```bash
# Wrong (local variable)
CONTEXT_CACHE_DB_PATH="/path"

# Correct (exported)
export CONTEXT_CACHE_DB_PATH="/path"
```

**Solution 2: Verify Variables**

```bash
echo $CONTEXT_CACHE_DB_PATH
# Should print the path
```

**Solution 3: Check Variable Names**

Use correct names:
- `CONTEXT_CACHE_DB_PATH` ✓
- `CONTEXT_CACHE_DATABASE_PATH` ✗

**Solution 4: Set in Shell Profile**

For persistence, add to `~/.bashrc` or `~/.zshrc`:
```bash
export CONTEXT_CACHE_DB_PATH="$HOME/notes/db.sqlite"
export CONTEXT_CACHE_KB_PATH="$HOME/notes"
```

Then source:
```bash
source ~/.bashrc
```

### Can't Find Knowledge Base

**Problem:** Indexer or CLI can't find markdown files

**Solution 1: Check Path**

```bash
ls ~/git/knowledge-base/*.md
# Should list markdown files
```

**Solution 2: Set Correct Path**

```bash
export CONTEXT_CACHE_KB_PATH="/actual/path/to/notes"
```

**Solution 3: Check File Extensions**

Only `.md` files are indexed. Rename if using other extensions:
```bash
# Rename .markdown to .md
for f in *.markdown; do mv "$f" "${f%.markdown}.md"; done
```

## Getting More Help

### Enable Debug Logging

For more detailed output:

```bash
# For MCP server
NODE_DEBUG=* node dist/mcp-server.js

# For search CLI  
DEBUG=* cc-kb-search "query"
```

### Check Test Suite

Run tests to verify installation:

```bash
npm test
# All 67 tests should pass
```

### Minimal Reproduction

Create minimal test case:

```typescript
import { initDatabase } from './src/database/init';
import { createEmbedder } from './src/indexer/embedder';
import { hybridSearch } from './src/search/hybrid';

const db = initDatabase('/tmp/test.db');
const embedder = await createEmbedder();

// Test search
const embedding = await embedder.generateEmbedding('test');
const results = await hybridSearch(db, 'test', embedding, 5);

console.log('Results:', results.length);
db.close();
```

### Report Issues

When reporting issues, include:

1. **Environment:**
   - OS and version
   - Node.js version (`node --version`)
   - npm version (`npm --version`)

2. **Configuration:**
   - Environment variables
   - Database location
   - Knowledge base location

3. **Error Messages:**
   - Complete error output
   - Stack traces
   - Log files

4. **Steps to Reproduce:**
   - Exact commands run
   - Expected vs actual behavior

## Next Steps

- [Usage Guide](USAGE.md) - Learn correct usage patterns
- [Configuration](CONFIGURATION.md) - Verify settings
- [Architecture](ARCHITECTURE.md) - Understand internals
