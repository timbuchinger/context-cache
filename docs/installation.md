# Installation Guide

## Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Operating System**: Linux, macOS, or Windows with WSL

## Quick Install

```bash
# Clone the repository
git clone <repository-url>
cd context-cache

# Install dependencies
npm install

# Build the project
npm run build
```

## Detailed Installation

### 1. Install Dependencies

```bash
npm install
```

This installs:
- **TypeScript** - For compilation
- **better-sqlite3** - SQLite database
- **@xenova/transformers** - Local embeddings (no API keys needed)
- **@modelcontextprotocol/sdk** - MCP protocol support
- **Jest** - Testing framework

### 2. Build from Source

```bash
# Clean previous builds (optional)
npm run clean

# Compile TypeScript to JavaScript
npm run build
```

This creates the `dist/` directory with compiled JavaScript files.

### 3. Link CLI Commands Globally (Optional)

To use the CLI commands from anywhere:

```bash
npm link
```

This makes the following commands globally available:
- `cc-mcp` - MCP server
- `cc-stats` - Index statistics
- `cc-kb-search` - Search notes

Alternatively, run commands directly:
```bash
node dist/mcp-server.js
node dist/stats-cli.js
node dist/search-cli.js
```

## Verify Installation

```bash
# Run tests
npm test

# Check build
npm run build

# Test CLI commands
node dist/stats-cli.js --help
node dist/search-cli.js --help
```

## Setting Up Your Knowledge Base

### Default Location

By default, Context Cache looks for notes in:
```
~/git/knowledge-base/
```

The database is stored at:
```
~/git/knowledge-base/db.sqlite
```

### Create Default Directory

```bash
mkdir -p ~/git/knowledge-base
```

### Add Your Notes

Copy your markdown files to the knowledge base directory:

```bash
cp -r /path/to/your/notes/*.md ~/git/knowledge-base/
```

### Custom Location

To use a different location, set environment variables (see [Configuration](CONFIGURATION.md)):

```bash
export CONTEXT_CACHE_KB_PATH="/path/to/your/notes"
export CONTEXT_CACHE_DB_PATH="/path/to/db.sqlite"
```

## Initial Indexing

After adding notes, index them (note: indexer CLI not yet implemented, use programmatically):

```typescript
import Database from 'better-sqlite3';
import { initDatabase } from './src/database/init';
import { indexFiles } from './src/indexer/index';
import { createEmbedder } from './src/indexer/embedder';

const db = initDatabase('~/git/knowledge-base/db.sqlite');
const embedder = await createEmbedder();
const stats = await indexFiles(db, '~/git/knowledge-base', embedder);
console.log(stats);
db.close();
```

## Troubleshooting

### better-sqlite3 Installation Issues

If `better-sqlite3` fails to install:

```bash
# Install build tools (Ubuntu/Debian)
sudo apt-get install build-essential python3

# Install build tools (macOS)
xcode-select --install

# Rebuild the native module
npm rebuild better-sqlite3
```

### Transformers Model Download

On first use, `@xenova/transformers` downloads the embedding model (~80MB). This happens automatically but requires internet access.

The model is cached in:
```
~/.cache/huggingface/transformers/
```

### Permission Issues

If you get permission errors with `npm link`:

```bash
# Use sudo (Linux/macOS)
sudo npm link

# Or configure npm to use a different prefix
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

## Next Steps

- [Usage Guide](USAGE.md) - Learn how to use the CLI and MCP server
- [Configuration](CONFIGURATION.md) - Customize settings
- [Architecture](ARCHITECTURE.md) - Understand how it works
