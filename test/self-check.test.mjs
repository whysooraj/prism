import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateIpOrHost } from '../dist/web/browser.js';
import { inspectWebsite } from '../dist/web/page-inspector.js';
import { indexRepository, getActiveIndex } from '../dist/repo/repo-inspector.js';
import { closeBrowser } from '../dist/web/browser.js';
import * as path from 'node:path';

test('SSRF safety: private IP & hostname blocklist', () => {
  assert.equal(isPrivateIpOrHost('localhost'), true);
  assert.equal(isPrivateIpOrHost('sub.localhost'), true);
  assert.equal(isPrivateIpOrHost('127.0.0.1'), true);
  assert.equal(isPrivateIpOrHost('169.254.169.254'), true); // AWS metadata
  assert.equal(isPrivateIpOrHost('10.0.0.15'), true);
  assert.equal(isPrivateIpOrHost('192.168.1.1'), true);
  assert.equal(isPrivateIpOrHost('172.20.0.1'), true);
  assert.equal(isPrivateIpOrHost('::1'), true);

  assert.equal(isPrivateIpOrHost('google.com'), false);
  assert.equal(isPrivateIpOrHost('github.com'), false);
  assert.equal(isPrivateIpOrHost('example.org'), false);
});

test('Web Layout & Design Intelligence', async () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>ContextBridge Test Page</title>
        <style>
          body { margin: 0; background-color: #09090b; color: #fafafa; font-family: Inter, sans-serif; }
          .hero { padding: 32px 16px; display: flex; flex-direction: column; gap: 16px; }
          .cta-btn {
            background-color: #3b82f6;
            color: #ffffff;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            display: inline-block;
          }
          .bad-contrast-text {
            color: #27272a; /* Dark gray on dark background -> Fails WCAG AA */
            background-color: #09090b;
            font-size: 14px;
          }
          .off-grid {
            padding: 13px; /* Deviates from 4/8pt grid */
          }
        </style>
      </head>
      <body>
        <div class="hero">
          <h1>Welcome to ContextBridge</h1>
          <p class="bad-contrast-text">Unreadable low-contrast text</p>
          <button class="cta-btn">Click Me</button>
          <div class="off-grid">Off grid box</div>
        </div>
      </body>
    </html>
  `;

  const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;

  const result = await inspectWebsite({
    url: dataUrl,
    viewport: { width: 1440, height: 900 },
    allowLocalhost: true,
    includeWireframeSvg: true
  });

  assert.equal(result.title, 'ContextBridge Test Page');
  assert.ok(result.palette.totalUniqueColors >= 2);
  assert.ok(result.typography.fontFamilies.includes('Inter'));
  assert.ok(result.wireframeSvg?.includes('<svg'));

  // Design Critique assertions
  assert.ok(result.critique.score < 100, 'Score should deduct for contrast and grid issues');
  assert.ok(
    result.critique.contrastIssues.some((c) => c.passesAA === false),
    'Should catch bad-contrast-text failing WCAG'
  );

  // Layout Node assertions
  assert.equal(result.layoutTree.tag, 'body');
  assert.ok(result.interactiveElements.some((e) => e.tag === 'button'));

  await closeBrowser();
});

test('Repository Ingestion & Symbol Intelligence', async () => {
  const currentProjectDir = path.resolve('.');

  const summary = await indexRepository(currentProjectDir);
  assert.ok(summary.totalFiles > 0);
  assert.ok(summary.languages['ts'] > 0);

  const index = getActiveIndex();

  // Symbol Search
  const searchResults = index.search('inspectWebsite');
  assert.ok(searchResults.length > 0);
  assert.equal(searchResults[0].symbol.name, 'inspectWebsite');

  // File Retrieval
  const fileData = index.getFormattedFile('src/types.ts', 1, 15);
  assert.equal(fileData.startLine, 1);
  assert.equal(fileData.endLine, 15);
  assert.ok(fileData.content.includes('BoxModel'));
  assert.ok(fileData.content.includes('1 |'));

  // Trace Symbol
  const trace = index.traceSymbol('acquireRepository');
  assert.ok(trace.definitions.length > 0);
  assert.equal(trace.definitions[0].name, 'acquireRepository');
});
