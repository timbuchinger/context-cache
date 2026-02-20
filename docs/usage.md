# Usage Guide

Complete guide to using Context Cache's CLI tools and MCP server.

## Table of Contents

- [CLI Tools](#cli-tools)
  - [Indexer CLI](#indexer-cli)
  - [Search CLI](#search-cli)
  - [Stats CLI](#stats-cli)
- [MCP Server](#mcp-server)
- [Examples](#examples)
- [Tips & Best Practices](#tips--best-practices)

## CLI Tools

### Indexer CLI

Index your markdown notes to make them searchable.

#### Basic Usage

```bash
cc-kb-index
```

Uses default paths from configuration:
- Knowledge Base: `~/git/knowledge-base/`
- Database: `~/git/knowledge-base/db.sqlite`

#### Options

```bash
cc-kb-index [options]

Options:
  --path <dir>       Path to knowledge base
  --db <path>        Path to database file
  --help, -h         Show help message
```

#### Examples

```bash
# Index default knowledge base
cc-kb-index

# Index custom directory
cc-kb-index --path ~/my-notes

# Use custom database location
cc-kb-index --db ~/custom/db.sqlite --path ~/notes

# With environment variables
CONTEXT_CACHE_KNOWLEDGE_BASE_PATH=~/docs cc-kb-index
```

#### Output

```
📚 Context Cache Indexer

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Knowledge Base: /Users/you/git/knowledge-base
Database:       /Users/you/git/knowledge-base/db.sqlite
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Using existing database...
🧠 Loading embedding model...
✓ Model loaded

🔍 Indexing files...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Indexing Complete

Files Processed:  15
  • Added:        5
  • Updated:      3
  • Skipped:      7
Chunks Created:   42
Time:             12.34s
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

#### Incremental Indexing

The indexer is smart about what it processes:
- **Skips** unchanged files (based on SHA256 hash)
- **Updates** modified files (deletes old chunks, creates new ones)
- **Adds** new files
- Only processes `*.md` files

### Search CLI

Search your notes directly from the command line using hybrid search (BM25 + vector embeddings).

#### Basic Usage

```bash
cc-kb-search "your search query"
```

#### Options

```bash
cc-kb-search <query> [options]

Arguments:
  query              Search query (required)

Options:
  --limit, -l <n>    Maximum number of results (default: 10)
  --help, -h         Show help message
```

#### Examples

**Basic Search:**
```bash
cc-kb-search "TypeScript patterns"
```

**Limit Results:**
```bash
cc-kb-search "async programming" --limit 5
cc-kb-search "error handling" -l 3
```

**Search with Phrases:**
```bash
cc-kb-search "dependency injection in Node.js"
```

**Semantic Search:**
```bash
# Finds semantically similar content, not just keyword matches
cc-kb-search "best practices for testing"
# Returns results about unit tests, TDD, mocking, etc.
```

#### Output Format

```
🔍 Searching for: "TypeScript patterns"

Found 5 result(s):

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. design-patterns/singleton.md (chunk 0)
   Score: 0.8543
   The Singleton pattern ensures a class has only one instance and provides...

2. typescript/advanced-types.md (chunk 2)
   Score: 0.7821
   Advanced TypeScript patterns include conditional types, mapped types, and...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Stats CLI

View statistics about your indexed notes.

#### Basic Usage

```bash
cc-stats
```

#### Options

```bash
cc-stats [options]

Options:
  --files, -f    Include list of all indexed files
```

#### Examples

**Basic Statistics:**
```bash
cc-stats
```

Output:
```
📊 Context Cache Index Statistics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Database:         ~/git/knowledge-base/db.sqlite
Total Files:      42
Total Chunks:     328
Avg Chunks/File:  7.81
Database Size:    2.14 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**With File List:**
```bash
cc-stats --files
```

Output includes all indexed files:
```
📊 Context Cache Index Statistics

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Database:         ~/git/knowledge-base/db.sqlite
Total Files:      42
Total Chunks:     328
Avg Chunks/File:  7.81
Database Size:    2.14 MB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 Indexed Files:

  • api/rest-design.md
  • architecture/microservices.md
  • database/sql-optimization.md
  • design-patterns/singleton.md
  ...
```

## MCP Server

The MCP (Model Context Protocol) server enables AI assistants like Claude Desktop to search your notes.

### Setup for Claude Desktop

1. **Locate Claude Desktop Config:**
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
   - Linux: `~/.config/Claude/claude_desktop_config.json`

2. **Add Context Cache Server:**

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

3. **Restart Claude Desktop**

4. **Verify Connection:**
   - Open Claude Desktop
   - Look for the tool icon (🔧) or "Available tools"
   - You should see `kb_search`

### Using in Claude Desktop

Once configured, you can ask Claude to search your notes:

**Example Prompts:**

```
Search my notes for information about TypeScript decorators

What do my notes say about REST API best practices?

Find notes related to Docker containerization

Search for examples of async/await patterns in my notes
```

### MCP Server Details

**Tool Name:** `kb_search`

**Description:** Search through notes using hybrid search (BM25 + vector embeddings)

**Parameters:**
- `query` (string, required): Search query
- `limit` (number, optional): Maximum number of results (default: 10)

**Response Format:**
```json
{
  "results": [
    {
      "file_path": "api/rest-design.md",
      "chunk_index": 0,
      "content": "REST API design principles...",
      "score": 0.8543
    }
  ]
}
```

### Running MCP Server Manually

For debugging or testing:

```bash
# Run directly
node dist/mcp-server.js

# With custom database
CONTEXT_CACHE_DB_PATH="/custom/db.sqlite" node dist/mcp-server.js
```

The server uses stdio transport and logs to stderr:
```
Starting Context Cache MCP Server with database: ~/git/knowledge-base/db.sqlite
```

## Examples

### Example 1: Technical Documentation

**Scenario:** You have technical docs and want to find API examples.

```bash
cc-kb-search "API authentication examples" --limit 5
```

Finds:
- JWT authentication patterns
- OAuth2 implementations
- API key management
- Session handling

### Example 2: Code Snippets

**Scenario:** Looking for TypeScript code patterns.

```bash
cc-kb-search "dependency injection TypeScript"
```

Returns relevant code snippets and explanations from your notes.

### Example 3: Meeting Notes

**Scenario:** Find decisions from past meetings.

```bash
cc-kb-search "architecture decisions microservices"
```

Surfaces relevant meeting notes and design documents.

### Example 4: Learning Notes

**Scenario:** Reviewing a topic you learned before.

```bash
cc-kb-search "functional programming concepts" -l 10
```

Returns your learning notes with relevant explanations.

## Tips & Best Practices

### Search Query Tips

1. **Be Specific:** More specific queries return better results
   - Good: "React hooks useEffect cleanup"
   - Less good: "React"

2. **Use Natural Language:** The semantic search understands context
   - "How to handle errors in async functions"
   - "Best practices for database indexing"

3. **Combine Keywords:** Mix specific terms with broader concepts
   - "GraphQL resolver error handling"
   - "Docker compose networking configuration"

### Organizing Notes

1. **Use Descriptive Filenames:**
   - `typescript-generics-guide.md` ✓
   - `notes.md` ✗

2. **Add Context:** Include topic context in your notes
   - Helps vector search understand semantics
   - Improves keyword matching

3. **Structure with Headers:** Use markdown headers for better chunking
   ```markdown
   # Main Topic
   
   ## Subtopic 1
   Content...
   
   ## Subtopic 2
   Content...
   ```

### Performance Optimization

1. **Incremental Indexing:** Only changed files are reprocessed
   - File hashes detect changes automatically
   - Skip unchanged files

2. **Chunk Size:** Default 500 words works well
   - Adjust for your content type
   - Smaller chunks for code snippets
   - Larger chunks for prose

3. **Search Limit:** Use appropriate limits
   - Smaller limits = faster results
   - Increase if you need more context

### Database Maintenance

**Check Index Status:**
```bash
cc-stats
```

**Monitor Database Size:**
- Database grows with more notes and embeddings
- ~10-20KB per chunk (content + embeddings)
- 384-dimensional embeddings use ~1.5KB per chunk

## Next Steps

- [Configuration](CONFIGURATION.md) - Customize behavior
- [Troubleshooting](TROUBLESHOOTING.md) - Solve common issues
- [Architecture](ARCHITECTURE.md) - Understand the system
