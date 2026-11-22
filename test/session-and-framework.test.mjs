import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { connectProject, getActiveSession } from '../dist/repo/session-manager.js';
import { inspectPage, inspectWebsite } from '../dist/web/page-inspector.js';
import { createHttpServer } from '../dist/http.js';
import { closeBrowser } from '../dist/web/browser.js';

test('session-manager: connectProject stores active session and inspectPage defaults to appUrl', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-session-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'App.tsx'),
      `export default function App() { return <h1>Active App</h1>; }`
    );

    const htmlContent = `<!DOCTYPE html><html><body><h1>Active App Running</h1></body></html>`;
    const appDataUrl = `data:text/html,${encodeURIComponent(htmlContent)}`;

    // Connect project with repoPath and appUrl
    const session = await connectProject({
      repoPath: tmpDir,
      appUrl: appDataUrl
    });

    assert.ok(session.sessionId.startsWith('session-'));
    assert.equal(session.repoPath, tmpDir);
    assert.equal(session.appUrl, appDataUrl);
    assert.equal(getActiveSession()?.sessionId, session.sessionId);

    // Call inspectPage WITHOUT passing url (must resolve from active session appUrl!)
    const pageResult = await inspectPage({ compact: true });
    assert.equal(pageResult.url, appDataUrl);
    assert.ok(pageResult.designCritique);
    assert.ok(typeof pageResult.designCritique.score === 'number');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await closeBrowser();
  }
});

test('framework metadata: extracts componentName from data-component and custom elements', async () => {
  const htmlWithComponents = `<!DOCTYPE html>
  <html>
    <body>
      <button data-component="SubmitOrderButton" id="btn-submit" style="width: 100px; height: 44px;">Submit</button>
      <aside data-component="NavigationSidebar" id="sidebar" style="width: 200px; height: 500px;">
        <a data-component="NavLink" href="/home">Home</a>
      </aside>
    </body>
  </html>`;

  const dataUrl = `data:text/html,${encodeURIComponent(htmlWithComponents)}`;
  const inspection = await inspectWebsite({ url: dataUrl, allowLocalhost: true });

  // 1. Check interactive elements component name
  const submitBtn = inspection.interactiveElements.find((e) => e.selector.includes('btn-submit'));
  assert.ok(submitBtn, 'Submit button must be detected');
  assert.equal(submitBtn.componentName, 'SubmitOrderButton');

  // 2. Check layout node component name
  function findNode(node, pred) {
    if (pred(node)) return node;
    for (const child of node.children || []) {
      const match = findNode(child, pred);
      if (match) return match;
    }
    return null;
  }

  const sidebarNode = findNode(inspection.layoutTree, (n) => n.id === 'sidebar');
  assert.ok(sidebarNode, 'Sidebar layout node must be found');
  assert.equal(sidebarNode.componentName, 'NavigationSidebar');

  await closeBrowser();
});

test('HTTP Server: POST /api/connect-project and /api/inspect-page', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-http-session-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'Index.tsx'),
      `export default function Index() { return <div>Home</div>; }`
    );

    const server = createHttpServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 3000;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const html = `<!DOCTYPE html><html><body><h2>HTTP Connected Session</h2></body></html>`;
      const dataUrl = `data:text/html,${encodeURIComponent(html)}`;

      // 1. POST /api/connect-project
      const connRes = await fetch(`${baseUrl}/api/connect-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoPath: tmpDir,
          appUrl: dataUrl
        })
      });
      assert.equal(connRes.status, 200);
      const connData = await connRes.json();
      assert.ok(connData.sessionId);
      assert.equal(connData.appUrl, dataUrl);

      // 2. POST /api/inspect-page (omitting url, should inspect active session appUrl)
      const inspectRes = await fetch(`${baseUrl}/api/inspect-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compact: true })
      });
      assert.equal(inspectRes.status, 200);
      const inspectData = await inspectRes.json();
      assert.equal(inspectData.url, dataUrl);
      assert.ok(inspectData.designCritique);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await closeBrowser();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
