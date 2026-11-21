import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHttpServer } from '../dist/http.js';
import { closeBrowser } from '../dist/web/browser.js';

test('HTTP Server & OpenAPI for ChatGPT Actions', async () => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Health endpoint
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.equal(healthData.status, 'ok');

    // 2. OpenAPI JSON endpoint for ChatGPT
    const specRes = await fetch(`${baseUrl}/openapi.json`);
    assert.equal(specRes.status, 200);
    const spec = await specRes.json();
    assert.equal(spec.openapi, '3.1.0');
    assert.ok(spec.paths['/api/inspect-website']);
    assert.ok(spec.paths['/api/index-repo']);
    assert.ok(spec.paths['/api/search-codebase']);

    // 2.5. Web Inspector UI Playground
    const uiRes = await fetch(`${baseUrl}/ui`);
    assert.equal(uiRes.status, 200);
    const uiHtml = await uiRes.text();
    assert.ok(uiHtml.includes('Prism UI Inspector'));

    // 3. Inspect mock website via HTTP
    const html = '<title>Action Test</title><div style="padding:16px;">Hello ChatGPT Action</div>';
    const dataUrl = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;

    const inspectRes = await fetch(`${baseUrl}/api/inspect-website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: dataUrl, allowLocalhost: true })
    });
    assert.equal(inspectRes.status, 200);
    const inspectData = await inspectRes.json();
    assert.equal(inspectData.title, 'Action Test');
    assert.ok(inspectData.designCritique.score >= 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeBrowser();
  }
});
