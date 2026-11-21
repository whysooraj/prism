import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { inspectWebsite, captureScreenshots } from './web/page-inspector.js';
import { indexRepository, getActiveIndex } from './repo/repo-inspector.js';
import type { SymbolKind } from './types.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'prism',
    version: '0.1.0'
  });

  // 1. Tool: inspect_website
  server.tool(
    'inspect_website',
    {
      url: z.string().url().describe('The URL of the website to inspect'),
      viewport: z
        .object({
          width: z.number().default(1440),
          height: z.number().default(900)
        })
        .optional()
        .describe('Viewport dimensions for inspection (desktop or mobile)'),
      includeWireframeSvg: z
        .boolean()
        .default(true)
        .describe('Whether to generate a deterministic layout wireframe SVG'),
      includeA11y: z
        .boolean()
        .default(false)
        .describe('Whether to extract the full accessibility snapshot'),
      allowLocalhost: z
        .boolean()
        .default(false)
        .describe('Allow inspecting localhost/private IPs (disabled by default for SSRF safety)')
    },
    async ({ url, viewport, includeWireframeSvg, includeA11y, allowLocalhost }) => {
      try {
        const result = await inspectWebsite({
          url,
          viewport: viewport || { width: 1440, height: 900 },
          includeWireframeSvg,
          includeA11y,
          allowLocalhost
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  url: result.url,
                  title: result.title,
                  viewport: result.viewport,
                  designCritique: result.critique,
                  palette: result.palette,
                  typography: result.typography,
                  interactiveElements: result.interactiveElements,
                  wireframeSvg: result.wireframeSvg,
                  accessibilityTree: result.accessibilityTree,
                  layoutTree: result.layoutTree
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Website inspection error: ${err.message}` }]
        };
      }
    }
  );

  // 2. Tool: capture_screenshots
  server.tool(
    'capture_screenshots',
    {
      url: z.string().url().describe('Website URL to capture'),
      allowLocalhost: z.boolean().default(false).describe('Allow localhost capture')
    },
    async ({ url, allowLocalhost }) => {
      try {
        const result = await captureScreenshots({ url, allowLocalhost });
        return {
          content: [
            {
              type: 'text',
              text: `Captured desktop (1440x900) and mobile (390x844) screenshots for ${url}`
            },
            {
              type: 'image',
              data: result.desktopBase64,
              mimeType: 'image/png'
            },
            {
              type: 'image',
              data: result.mobileBase64,
              mimeType: 'image/png'
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Screenshot capture failed: ${err.message}` }]
        };
      }
    }
  );

  // 3. Tool: index_repository
  server.tool(
    'index_repository',
    {
      urlOrPath: z
        .string()
        .describe('GitHub repository URL (https://github.com/...) or local filesystem path'),
      branch: z.string().optional().describe('Specific git branch to clone/index'),
      authToken: z.string().optional().describe('GitHub personal access token for private repositories')
    },
    async ({ urlOrPath, branch, authToken }) => {
      try {
        const result = await indexRepository(urlOrPath, branch, authToken);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Repository indexing error: ${err.message}` }]
        };
      }
    }
  );

  // 4. Tool: search_codebase
  server.tool(
    'search_codebase',
    {
      query: z
        .string()
        .describe('Symbol name, keyword, or concept to search (e.g. "auth", "loginHandler", "UserTable")'),
      kind: z
        .enum(['function', 'method', 'class', 'interface', 'type', 'variable', 'route'])
        .optional()
        .describe('Filter by symbol kind'),
      limit: z.number().default(15).describe('Maximum number of matching symbols to return')
    },
    async ({ query, kind, limit }) => {
      try {
        const index = getActiveIndex();
        const matches = index.search(query, kind as SymbolKind | undefined, limit);

        if (matches.length === 0) {
          return {
            content: [{ type: 'text', text: `No symbols found matching query: "${query}"` }]
          };
        }

        const formatted = matches.map((m) => ({
          name: m.symbol.name,
          kind: m.symbol.kind,
          file: m.symbol.filePath,
          lines: `${m.symbol.startLine}-${m.symbol.endLine}`,
          signature: m.symbol.signature || undefined,
          exported: m.symbol.exported
        }));

        return {
          content: [{ type: 'text', text: JSON.stringify(formatted, null, 2) }]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Search error: ${err.message}` }]
        };
      }
    }
  );

  // 5. Tool: get_file
  server.tool(
    'get_file',
    {
      filePath: z.string().describe('Relative path to the file in the indexed repository'),
      startLine: z.number().optional().describe('1-based starting line number'),
      endLine: z.number().optional().describe('1-based ending line number')
    },
    async ({ filePath, startLine, endLine }) => {
      try {
        const index = getActiveIndex();
        const fileData = index.getFormattedFile(filePath, startLine, endLine);

        return {
          content: [
            {
              type: 'text',
              text: `File: ${fileData.filePath} (lines ${fileData.startLine}-${fileData.endLine} of ${fileData.totalLines}):\n\n${fileData.content}`
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `File retrieval error: ${err.message}` }]
        };
      }
    }
  );

  // 6. Tool: trace_symbol
  server.tool(
    'trace_symbol',
    {
      symbolName: z.string().describe('Exact name of function, class, or variable to trace')
    },
    async ({ symbolName }) => {
      try {
        const index = getActiveIndex();
        const trace = index.traceSymbol(symbolName);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  symbol: symbolName,
                  definitions: trace.definitions.map((d) => ({
                    file: d.filePath,
                    lines: `${d.startLine}-${d.endLine}`,
                    signature: d.signature
                  })),
                  importedByFiles: trace.importedBy,
                  connectedRoutes: trace.connectedRoutes
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Trace error: ${err.message}` }]
        };
      }
    }
  );

  // 7. Tool: explain_architecture
  server.tool('explain_architecture', {}, async () => {
    try {
      const index = getActiveIndex();
      const meta = index.getMetadata();
      const tree = index.getFileTree();
      const routes = index.getRoutes();

      const topLevelDirs = new Set(
        tree.map((f) => f.split('/')[0]).filter((part) => part && part.includes('.'))
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                repoName: meta.name,
                branch: meta.branch,
                commit: meta.commitHash,
                totalFiles: meta.totalFiles,
                languages: meta.languages,
                entryPoints: meta.entryPoints,
                keyConfigs: Object.keys(meta.configs),
                routes: routes.slice(0, 30),
                directoryLayout: Array.from(topLevelDirs)
              },
              null,
              2
            )
          }
        ]
      };
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Architecture explanation error: ${err.message}` }]
      };
    }
  });

  return server;
}
