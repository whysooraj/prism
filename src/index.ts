#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { closeBrowser } from './web/browser.js';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();

  process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
  });

  await server.connect(transport);
  console.error('[context-bridge] MCP server running on stdio');
}

main().catch(async (err) => {
  console.error('[context-bridge] Fatal error:', err);
  await closeBrowser();
  process.exit(1);
});
