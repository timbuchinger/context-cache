#!/usr/bin/env node

import { runMCPServer } from './mcp/server';
import { getConfig } from './shared/config';

async function main() {
  const dbPath = getConfig('databasePath') as string;
  console.error(`Starting Context Cache MCP Server with database: ${dbPath}`);
  await runMCPServer(dbPath);
}

main().catch((error) => {
  console.error('Error starting MCP server:', error);
  process.exit(1);
});
