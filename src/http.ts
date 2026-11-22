#!/usr/bin/env node
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectWebsite } from './web/page-inspector.js';
import { verifyChange } from './web/change-verifier.js';
import { indexRepository, getActiveIndex } from './repo/repo-inspector.js';
import { findUiSource } from './correlation/correlator.js';
import { closeBrowser } from './web/browser.js';
import type { SymbolKind, WebInspectionResult } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPENAPI_PATH = path.resolve(__dirname, '..', 'openapi.json');
const PLUGIN_MANIFEST_PATH = path.resolve(__dirname, '..', '.well-known', 'ai-plugin.json');
const UI_PATHS = [
  path.resolve(__dirname, 'web', 'ui.html'),
  path.resolve(__dirname, '..', 'src', 'web', 'ui.html'),
  path.resolve(__dirname, '..', 'dist', 'web', 'ui.html')
];

function getUiHtml(): string | null {
  for (const p of UI_PATHS) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  }
  return null;
}

const PORT = parseInt(process.env.PORT || '3000', 10);

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        // 5MB limit
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function createHttpServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      });
      return res.end();
    }

    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    try {
      // 0. Serve Interactive Web Inspector Playground UI
      if (req.method === 'GET' && (pathname === '/ui' || pathname === '/playground')) {
        const html = getUiHtml();
        if (html) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          return res.end(html);
        }
        return sendJson(res, 404, { error: 'UI template not found' });
      }

      // 1. Health check & status
      if (req.method === 'GET' && (pathname === '/' || pathname === '/health' || pathname === '/api/health')) {
        // If browser visits root directly, redirect to /ui
        const accept = req.headers.accept || '';
        if (pathname === '/' && accept.includes('text/html')) {
          res.writeHead(302, { Location: '/ui' });
          return res.end();
        }

        return sendJson(res, 200, {
          status: 'ok',
          service: 'prism-context-api',
          version: '0.1.0',
          ui: '/ui',
          docs: '/openapi.json',
          endpoints: [
            'GET /ui',
            'POST /api/inspect-website',
            'POST /api/verify-change',
            'POST /api/find-ui-source',
            'POST /api/index-repo',
            'POST /api/search-codebase',
            'POST /api/get-file',
            'POST /api/trace-symbol'
          ]
        });
      }

      // 2. Serve classic ChatGPT Plugin manifest
      if (req.method === 'GET' && pathname === '/.well-known/ai-plugin.json') {
        if (fs.existsSync(PLUGIN_MANIFEST_PATH)) {
          const raw = fs.readFileSync(PLUGIN_MANIFEST_PATH, 'utf-8');
          const manifest = JSON.parse(raw);
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          manifest.api.url = `${protocol}://${req.headers.host}/openapi.json`;
          return sendJson(res, 200, manifest);
        }
        return sendJson(res, 404, { error: 'ai-plugin.json not found' });
      }

      // 3. Serve OpenAPI schema directly for ChatGPT Actions & Plugins import
      if (req.method === 'GET' && pathname === '/openapi.json') {
        if (fs.existsSync(OPENAPI_PATH)) {
          const raw = fs.readFileSync(OPENAPI_PATH, 'utf-8');
          // Dynamically adjust server URL to current host
          const spec = JSON.parse(raw);
          const protocol = req.headers['x-forwarded-proto'] || 'http';
          spec.servers = [{ url: `${protocol}://${req.headers.host}` }];
          return sendJson(res, 200, spec);
        }
        return sendJson(res, 404, { error: 'openapi.json not found' });
      }

      // 3. POST /api/inspect-website
      if (req.method === 'POST' && pathname === '/api/inspect-website') {
        const body = await parseBody(req);
        if (!body.url) {
          return sendJson(res, 400, { error: 'Missing required parameter: "url"' });
        }

        const clientIp = req.socket.remoteAddress || '';
        const isLocalCaller = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
        const allowLocal = (body.allowLocalhost === true && (isLocalCaller || process.env.PRISM_ALLOW_LOCALHOST === '1')) || body.url.startsWith('data:');

        const result = await inspectWebsite({
          url: body.url,
          viewport: body.viewport || { width: 1440, height: 900 },
          includeWireframeSvg: body.includeWireframeSvg !== false,
          allowLocalhost: allowLocal
        });

        return sendJson(res, 200, {
          url: result.url,
          title: result.title,
          viewport: result.viewport,
          designCritique: result.critique,
          palette: result.palette,
          typography: result.typography,
          interactiveElementsCount: result.interactiveElements.length,
          asciiRadar: result.asciiRadar,
          wireframeSvg: result.wireframeSvg
        });
      }

      // 3.5. POST /api/verify-change
      if (req.method === 'POST' && pathname === '/api/verify-change') {
        const body = await parseBody(req);
        if (!body.before && !body.beforeUrl) {
          return sendJson(res, 400, { error: 'Missing required parameter: "before" or "beforeUrl"' });
        }
        if (!body.after && !body.afterUrl) {
          return sendJson(res, 400, { error: 'Missing required parameter: "after" or "afterUrl"' });
        }

        const clientIp = req.socket.remoteAddress || '';
        const isLocalCaller = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
        const allowLocal =
          (body.allowLocalhost === true && (isLocalCaller || process.env.PRISM_ALLOW_LOCALHOST === '1')) ||
          (typeof body.beforeUrl === 'string' && body.beforeUrl.startsWith('data:')) ||
          (typeof body.afterUrl === 'string' && body.afterUrl.startsWith('data:'));

        const vp = body.viewport || { width: 1440, height: 900 };

        let beforeData: WebInspectionResult = body.before;
        if (!beforeData && body.beforeUrl) {
          beforeData = await inspectWebsite({
            url: body.beforeUrl,
            viewport: vp,
            allowLocalhost: allowLocal
          });
        }

        let afterData: WebInspectionResult = body.after;
        if (!afterData && body.afterUrl) {
          afterData = await inspectWebsite({
            url: body.afterUrl,
            viewport: vp,
            allowLocalhost: allowLocal
          });
        }

        const verification = verifyChange(beforeData, afterData);
        return sendJson(res, 200, verification);
      }

      // 4. POST /api/index-repo
      if (req.method === 'POST' && pathname === '/api/index-repo') {
        const body = await parseBody(req);
        const repoUrl = body.url || body.urlOrPath;
        if (!repoUrl) {
          return sendJson(res, 400, { error: 'Missing required parameter: "url"' });
        }

        const summary = await indexRepository(repoUrl, body.branch, body.authToken);
        return sendJson(res, 200, summary);
      }

      // 5. POST /api/search-codebase
      if (req.method === 'POST' && pathname === '/api/search-codebase') {
        const body = await parseBody(req);
        if (!body.query) {
          return sendJson(res, 400, { error: 'Missing required parameter: "query"' });
        }

        const index = getActiveIndex();
        const matches = index.search(body.query, body.kind as SymbolKind, body.limit || 15);
        return sendJson(res, 200, {
          query: body.query,
          count: matches.length,
          results: matches.map((m) => ({
            name: m.symbol.name,
            kind: m.symbol.kind,
            file: m.symbol.filePath,
            lines: `${m.symbol.startLine}-${m.symbol.endLine}`,
            signature: m.symbol.signature,
            exported: m.symbol.exported
          }))
        });
      }

      // 6. POST /api/get-file
      if (req.method === 'POST' && pathname === '/api/get-file') {
        const body = await parseBody(req);
        if (!body.filePath) {
          return sendJson(res, 400, { error: 'Missing required parameter: "filePath"' });
        }

        const index = getActiveIndex();
        const fileData = index.getFormattedFile(body.filePath, body.startLine, body.endLine);
        return sendJson(res, 200, fileData);
      }

      // 7. POST /api/trace-symbol
      if (req.method === 'POST' && pathname === '/api/trace-symbol') {
        const body = await parseBody(req);
        if (!body.symbolName) {
          return sendJson(res, 400, { error: 'Missing required parameter: "symbolName"' });
        }

        const index = getActiveIndex();
        const trace = index.traceSymbol(body.symbolName);
        return sendJson(res, 200, {
          symbol: body.symbolName,
          definitions: trace.definitions.map((d) => ({
            file: d.filePath,
            lines: `${d.startLine}-${d.endLine}`,
            signature: d.signature
          })),
          importedBy: trace.importedBy,
          reExportedBy: trace.reExportedBy,
          callers: trace.callers,
          callees: trace.callees,
          connectedRoutes: trace.connectedRoutes
        });
      }

      // 8. POST /api/find-ui-source (Visual-to-Code Correlation)
      if (req.method === 'POST' && pathname === '/api/find-ui-source') {
        const body = await parseBody(req);
        const correlation = findUiSource({
          urlOrRoute: body.url || body.route || body.urlOrRoute,
          selector: body.selector,
          textSnippet: body.textSnippet || body.text,
          tag: body.tag,
          repoIdentifier: body.repoIdentifier
        });
        return sendJson(res, 200, correlation);
      }

      return sendJson(res, 404, { error: `Endpoint not found: ${req.method} ${pathname}` });
    } catch (err: any) {
      return sendJson(res, 500, { error: err.message || 'Internal Server Error' });
    }
  });

  return server;
}

if (process.argv[1] && process.argv[1].endsWith('http.js')) {
  const server = createHttpServer();
  server.listen(PORT, () => {
    console.log(`[prism] HTTP & ChatGPT Action server listening on http://localhost:${PORT}`);
    console.log(`[prism] OpenAPI Schema available at http://localhost:${PORT}/openapi.json`);
  });

  process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await closeBrowser();
    process.exit(0);
  });
}
