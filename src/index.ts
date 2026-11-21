#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { createHttpServer } from './http.js';
import { closeBrowser } from './web/browser.js';

async function main() {
  const args = process.argv.slice(2);

  // If "serve" or "http" is passed, run HTTP server for ChatGPT / remote access
  if (args.includes('serve') || args.includes('http')) {
    const portIdx = args.findIndex((a) => a === '--port' || a === '-p');
    const port = portIdx !== -1 && args[portIdx + 1] ? parseInt(args[portIdx + 1], 10) : parseInt(process.env.PORT || '3000', 10);

    const httpServer = createHttpServer();
    httpServer.listen(port, () => {
      console.log(`[prism] HTTP & ChatGPT Plugin server running at: http://localhost:${port}`);
      console.log(`[prism] Plugin manifest: http://localhost:${port}/.well-known/ai-plugin.json`);
      console.log(`[prism] OpenAPI spec:    http://localhost:${port}/openapi.json`);
    });

    process.on('SIGINT', async () => {
      await closeBrowser();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await closeBrowser();
      process.exit(0);
    });
    return;
  }

  // Default: Run MCP server over stdio
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
  console.error('[prism] MCP server running on stdio');
}

main().catch(async (err) => {
  console.error('[prism] Fatal error:', err);
  await closeBrowser();
  process.exit(1);
});
