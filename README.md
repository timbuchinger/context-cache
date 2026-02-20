# Context Cache

A memory storage and retrieval system for AI coding agents. Context Cache enables intelligent search across your markdown notes and conversation transcripts using hybrid search (BM25 + vector embeddings) with zero configuration.

## ✨ Features

- 🔍 **Hybrid Search** - Combines keyword (BM25) and semantic (vector) search
- 🚀 **Zero Config** - Works out of the box with sensible defaults
- 🧠 **Local Embeddings** - No API keys required, uses `@xenova/transformers`
- 🔌 **MCP Server** - Integrates with Claude Desktop and other MCP clients
- 🛠️ **CLI Tools** - Index, search, and view stats from command line
- 📊 **Incremental Indexing** - Only reprocesses changed files
- ✅ **100% Test Coverage** - Built with strict Test-Driven Development

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Index your knowledge base
cc-kb-index

# Search knowledge base
cc-kb-search "TypeScript patterns"

# Index conversations
cc-conversations-index

# Search conversations
cc-conversations-search "async patterns"

# View statistics
cc-stats
```

## Status

**91 Tests Passing** | **100% Test Coverage** | **Production Ready** ✅

## 📖 Documentation

Complete documentation is available in the [`docs/`](docs/) directory. Start with the **[Documentation Index](docs/index.md)** for an overview.

**Quick Links:**
- **[Installation Guide](docs/installation.md)** - Setup and building from source
- **[Usage Guide](docs/usage.md)** - CLI tools, MCP server, and examples
- **[Quick Start Guide](docs/quick-start.md)** - Skills and MCP tools guide
- **[Configuration](docs/configuration.md)** - Environment variables and customization
- **[Architecture](docs/architecture/)** - System design and components
- **[API Reference](docs/api.md)** - Key functions and interfaces
- **[Technical Notes](docs/technical-notes.md)** - Implementation highlights and design decisions
- **[Technical Updates](docs/technical-updates.md)** - Recent improvements and fixes
- **[Troubleshooting](docs/troubleshooting.md)** - Common issues and solutions

## CLI Tools

All commands are prefixed with `cc-` for quick access:

```bash
cc-kb-index                     # Index markdown knowledge base files
cc-kb-search <query>            # Search indexed knowledge base
cc-conversations-index          # Extract and index AI conversations
cc-conversations-search <query> # Search indexed conversations
cc-stats                        # View index statistics (KB + conversations)
cc-mcp                          # MCP server for Claude Desktop
```

See [Usage Guide](docs/usage.md) for detailed examples.

## Technology Stack

- **TypeScript** - Type-safe development
- **SQLite** with **FTS5** - Full-text search with BM25 ranking
- **better-sqlite3** - Fast synchronous SQLite access
- **@xenova/transformers** - Local embedding generation (384d)
- **@modelcontextprotocol/sdk** - MCP protocol support
- **Jest** - Testing framework with 100% coverage

## Development

```bash
# Run tests
npm test

# Watch mode
npm test:watch

# Build
npm run build

# Clean
npm run clean
```

See [Architecture documentation](docs/architecture/) for system design details.

## License

ISC

---

**Built with strict Test-Driven Development (TDD)** - Every feature was tested before implementation.
