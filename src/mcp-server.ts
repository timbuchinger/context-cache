#!/usr/bin/env node

import { runMCPServer, ServerOptions } from './mcp/server';
import { getConfig } from './shared/config';

async function main() {
  const dbPath = getConfig('databasePath') as string;

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const options: ServerOptions = {};

  if (args.includes('--http')) {
    options.mode = 'http';
    const portIndex = args.indexOf('--port');
    if (portIndex !== -1 && args[portIndex + 1]) {
      options.port = parseInt(args[portIndex + 1], 10);
    }
  }

  const modeStr = options.mode === 'http' ? `HTTP mode on port ${options.port || 3000}` : 'stdio mode';
  console.error(`Starting Context Cache MCP Server with database: ${dbPath} (${modeStr})`);
  await runMCPServer(dbPath, options);
}

main().catch((error) => {
  console.error('Error starting MCP server:', error);
  process.exit(1);
});
