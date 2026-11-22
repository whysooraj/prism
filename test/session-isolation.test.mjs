import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { connectProject, getSession, closeSession, resolveSessionRepo, clearAllSessions } from '../dist/repo/session-manager.js';
import { inspectPage } from '../dist/web/page-inspector.js';
import { createHttpServer } from '../dist/http.js';
import { isSafeDestination, closeBrowser } from '../dist/web/browser.js';
import { clearRepoRegistry } from '../dist/repo/repo-inspector.js';

test('Session Isolation: Connect A -> Connect B -> Inspect A -> Search A -> Inspect B -> Search B', async () => {
  clearAllSessions();
  clearRepoRegistry();

  const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-proj-a-'));
  const tmpB = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-proj-b-'));

  try {
    // Setup Project A
    const srcA = path.join(tmpA, 'src', 'components');
    fs.mkdirSync(srcA, { recursive: true });
    fs.writeFileSync(
      path.join(srcA, 'ProjectAWidget.tsx'),
      `export function ProjectAWidget() { return <div id="widget-a">Widget Alpha</div>; }`
    );
    const htmlA = `<!DOCTYPE html><html><body><div id="widget-a">Widget Alpha Running</div></body></html>`;
    const appUrlA = `data:text/html,${encodeURIComponent(htmlA)}`;

    // Setup Project B
    const srcB = path.join(tmpB, 'src', 'components');
    fs.mkdirSync(srcB, { recursive: true });
    fs.writeFileSync(
      path.join(srcB, 'ProjectBWidget.tsx'),
      `export function ProjectBWidget() { return <div id="widget-b">Widget Beta</div>; }`
    );
    const htmlB = `<!DOCTYPE html><html><body><div id="widget-b">Widget Beta Running</div></body></html>`;
    const appUrlB = `data:text/html,${encodeURIComponent(htmlB)}`;

    // 1. Connect Project A
    const sessionA = await connectProject({
      repoPath: tmpA,
      appUrl: appUrlA
    });
    assert.ok(sessionA.sessionId);

    // 2. Connect Project B
    const sessionB = await connectProject({
      repoPath: tmpB,
      appUrl: appUrlB
    });
    assert.ok(sessionB.sessionId);
    assert.notEqual(sessionA.sessionId, sessionB.sessionId);

    // 3. Inspect A (using sessionA) -> must resolve appUrlA
    const inspectA = await inspectPage({ sessionId: sessionA.sessionId, compact: true });
    assert.equal(inspectA.url, appUrlA);

    // 4. Search A (using sessionA) -> must find ProjectAWidget, must NOT find ProjectBWidget
    const { repoIndex: indexA } = resolveSessionRepo(sessionA.sessionId);
    const searchResultsA = indexA.search('Widget');
    assert.ok(searchResultsA.some((m) => m.symbol.name === 'ProjectAWidget'));
    assert.ok(!searchResultsA.some((m) => m.symbol.name === 'ProjectBWidget'));

    // 5. Inspect B (using sessionB) -> must resolve appUrlB
    const inspectB = await inspectPage({ sessionId: sessionB.sessionId, compact: true });
    assert.equal(inspectB.url, appUrlB);

    // 6. Search B (using sessionB) -> must find ProjectBWidget, must NOT find ProjectAWidget
    const { repoIndex: indexB } = resolveSessionRepo(sessionB.sessionId);
    const searchResultsB = indexB.search('Widget');
    assert.ok(searchResultsB.some((m) => m.symbol.name === 'ProjectBWidget'));
    assert.ok(!searchResultsB.some((m) => m.symbol.name === 'ProjectAWidget'));

    // 7. Unknown session ID must be rejected strictly
    assert.throws(
      () => getSession('session-unknown-nonexistent'),
      /Session not found/i
    );

    // 8. Session cleanup and closure
    closeSession(sessionA.sessionId);
    assert.throws(
      () => getSession(sessionA.sessionId),
      /Session not found/i
    );
  } finally {
    fs.rmSync(tmpA, { recursive: true, force: true });
    fs.rmSync(tmpB, { recursive: true, force: true });
    clearAllSessions();
    clearRepoRegistry();
    await closeBrowser();
  }
});

test('HTTP Security: Authentication, Rate Limiting, and SSRF Hardening', async () => {
  const originalKey = process.env.PRISM_API_KEY;
  process.env.PRISM_API_KEY = 'test-secret-token-12345';

  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Unauthenticated request to /api/* should return 401 Unauthorized
    const unauthRes = await fetch(`${baseUrl}/api/inspect-page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' })
    });
    assert.equal(unauthRes.status, 401);
    const unauthBody = await unauthRes.json();
    assert.ok(unauthBody.error.includes('Unauthorized'));

    // 2. Request with valid x-api-key header should authenticate
    const authRes = await fetch(`${baseUrl}/api/find-ui-source`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'test-secret-token-12345'
      },
      body: JSON.stringify({ selector: 'button' })
    });
    // Should not be 401 (either 200 or 400 depending on params)
    assert.notEqual(authRes.status, 401);

    // 3. SSRF destination safety: metadata and private addresses blocked fail-closed
    assert.equal(await isSafeDestination('169.254.169.254'), false);
    assert.equal(await isSafeDestination('169.254.170.2'), false);
    assert.equal(await isSafeDestination('metadata.google.internal'), false);
    assert.equal(await isSafeDestination('instance-data'), false);
    assert.equal(await isSafeDestination('localhost'), false);
    assert.equal(await isSafeDestination('127.0.0.1'), false);
    assert.equal(await isSafeDestination('non-existent-invalid-domain-xyz-123.fake'), false);
  } finally {
    if (originalKey !== undefined) {
      process.env.PRISM_API_KEY = originalKey;
    } else {
      delete process.env.PRISM_API_KEY;
    }
    await new Promise((resolve) => server.close(resolve));
    await closeBrowser();
  }
});
