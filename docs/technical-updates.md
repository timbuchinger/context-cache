# Technical Updates

Recent implementation improvements, bug fixes, and enhancements to Context Cache.

## MCP Database Initialization Fix

### Issue
When an agent called the MCP server tool `conversations_search`, it failed with:
```
McpError: MCP error -32603: no such table: exchanges
```

### Root Cause
The MCP server was opening the database with `new Database(dbPath)` but **not calling `initDatabase()`** to ensure the schema was created. This meant:

1. If the database file didn't exist, it would create an empty one
2. If it existed but was missing tables (e.g., conversations/exchanges), those tables would never be created
3. Tests passed because they explicitly called `initDatabase()` in setup

### Solution

**File:** `src/mcp/server.ts`

Changed from:
```typescript
import Database from 'better-sqlite3';
// Missing: import { initDatabase } from '../database/init';

if (name === 'conversations_search') {
  const db = new Database(this.dbPath);  // ❌ No schema init
  try {
    const results = await searchConversations(db, query, { limit });
    // ...
  }
}
```

To:
```typescript
import Database from 'better-sqlite3';
import { initDatabase } from '../database/init';  // ✅ Added import

if (name === 'conversations_search') {
  const db = initDatabase(this.dbPath);  // ✅ Creates schema if needed
  try {
    const results = await searchConversations(db, query, { limit });
    // ...
  }
}
```

### What initDatabase() Does

The `initDatabase()` function from `src/database/init.ts`:

1. Opens the database with `new Database(dbPath)`
2. Creates all required tables if they don't exist:
   - `files` - Indexed markdown files
   - `chunks` - Content chunks with embeddings
   - `chunks_fts` - Full-text search index
   - `conversations` - Conversation metadata
   - `exchanges` - User-assistant exchanges with embeddings
3. Creates all necessary indexes
4. Returns the initialized database

The function uses `CREATE TABLE IF NOT EXISTS`, so it's safe to call multiple times - it only creates missing tables.

### Impact

- ✅ MCP tools now work on first call (database initialized automatically)
- ✅ No more "table not found" errors
- ✅ Consistent with test setup patterns
- ✅ All tests continue to pass

## Automatic Embeddings for Conversations

### Change Summary
Removed the `--embeddings` flag from the conversation sync CLI. Embeddings are now **automatically generated** for all new and updated conversations.

### What Changed

**Before:**
```bash
cc-conversations-index sync --embeddings
```

**After:**
```bash
cc-conversations-index sync  # Always generates embeddings
```

### Code Changes

#### CLI Changes (`src/cli/conversation-cli.ts`)

- Removed `embeddings: boolean` parameter from `syncConversations()` options
- Removed `--embeddings` / `-e` flag parsing
- Always create embedder and call `await embedder.init()`
- Always pass embedder to `indexConversationFiles()`
- Updated help text to remove flag documentation

#### Indexer Changes (`src/conversations/indexer.ts`)

**Before:**
```typescript
export interface IndexOptions {
  embedder?: Embedder;
  generateEmbeddings?: boolean;  // Flag to control generation
}

// Only generate if both embedder AND flag are true
if (options?.generateEmbeddings && options.embedder) {
  await generateExchangeEmbeddings(parsed.exchanges, options.embedder);
}
```

**After:**
```typescript
export interface IndexOptions {
  embedder?: Embedder;  // Simplified interface
}

// Generate whenever embedder is provided
if (options?.embedder) {
  await generateExchangeEmbeddings(parsed.exchanges, options.embedder);
}
```

**Rationale:**
- Simpler interface - presence of embedder implies intent to generate
- CLI always passes embedder, so embeddings are always generated
- No conditional logic needed

### Benefits

#### User Experience
- ✅ Simpler CLI - no flags to remember
- ✅ Embeddings always available for semantic search
- ✅ Consistent behavior - no confusion about when embeddings exist
- ✅ One less thing to document

#### Implementation
- ✅ Cleaner code - removed conditional logic
- ✅ Simpler interface - fewer parameters
- ✅ Less cognitive overhead - embeddings are implicit

#### Functionality
- ✅ Semantic search works out of the box
- ✅ No partial indexing where some conversations lack embeddings
- ✅ Future vector search will work immediately

### Performance Impact

**Minimal:**
- Embedding generation adds ~0.5-1 second per conversation
- Only happens on new/updated conversations (not every sync)
- Local model (no API calls)
- Acceptable trade-off for always-available semantic search

**Example:**
- 56 conversations: ~30-60 seconds total for initial sync
- Incremental syncs: only new conversations affected

### Migration for Existing Databases

Users with existing conversation indexes (without embeddings) can re-index:

```bash
# Remove old database
rm -rf ~/.context-cache

# Re-sync with automatic embeddings
cc-conversations-index sync
```

This will:
1. Extract all conversations again
2. Index with embeddings automatically
3. Enable semantic search

## Conversation Display Architecture

### Question
Does `conversation_show` use the database, and how does this compare to episodic-memory's approach?

### Answer

**Our implementation (`conversation_show`):** Does NOT use the database  
**Episodic-memory (`episodic_memory_show`/`read`):** Also does NOT use the database

Both implementations read the JSONL conversation file directly from disk for displaying full conversations.

### Why This Makes Sense

#### Performance
- **Database approach would be slower:**
  - Query to fetch conversation metadata
  - Query to fetch all exchanges
  - Join operations
  - Serialization/deserialization overhead

- **Direct file read is faster:**
  - Single file read operation
  - Parse JSONL line-by-line
  - No database query overhead
  - Simpler code path

#### Data Freshness
- **Direct file read:** Always shows current state of file
- **Database:** Could be stale if file was modified but not re-indexed

#### Use Case Separation

**Database (for search):**
- Find relevant conversations by content
- Semantic similarity search
- Date/time filtering
- Indexed for fast queries
- Returns file paths

**Direct file read (for display):**
- Show full conversation content
- Format for human reading
- Support pagination (startLine/endLine)
- No need for database schema

### Workflow Pattern

```
1. User/Agent: "Find conversations about authentication"
   ↓
2. MCP Tool: conversations_search
   ↓
3. Database Query: Search indexed exchanges
   ↓
4. Returns: List of results with file paths
   {
     path: "/path/to/conversation.jsonl",
     snippet: "...",
     score: 0.85
   }
   ↓
5. User/Agent: "Show full conversation"
   ↓
6. MCP Tool: conversation_show
   ↓
7. File System: Read JSONL file directly (NO DATABASE)
   ↓
8. Returns: Full formatted conversation
```

### Implementation Details

**Our Implementation (context-cache):**

```typescript
// src/conversations/show.ts

export function showConversationByPath(
  path: string,
  options: ShowOptions = {}
): string {
  if (!fs.existsSync(path)) {
    return `File not found: ${path}`;
  }
  
  // Read JSONL file directly - NO DATABASE
  const content = fs.readFileSync(path, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  // Parse and format...
  const events = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(e => e !== null);
  
  // Extract exchanges and format as markdown
  return formattedMarkdown;
}
```

### Design Decision: Correct Approach ✅

Using direct file reads for conversation_show is correct because:

1. **Performance:** Single file read vs. multiple DB queries
2. **Simplicity:** Less code, fewer dependencies
3. **Reliability:** Files are source of truth
4. **Flexibility:** Easy to change formatting without schema migrations
5. **Proven pattern:** Matches episodic-memory's successful design

---

**Last Updated:** 2026-02-19  
**All tests passing:** ✅  
**Build status:** ✅ Clean

