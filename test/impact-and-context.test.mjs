import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { indexRepository, getActiveIndex } from '../dist/repo/repo-inspector.js';
import { getContext } from '../dist/correlation/correlator.js';
import { createHttpServer } from '../dist/http.js';
import { closeBrowser } from '../dist/web/browser.js';

test('traceImpact: computes direct, transitive dependents, affected routes, and risk score', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-impact-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src');
    const compDir = path.join(srcDir, 'components');
    const pagesDir = path.join(srcDir, 'pages');
    fs.mkdirSync(compDir, { recursive: true });
    fs.mkdirSync(pagesDir, { recursive: true });

    // 1. Base component Button
    fs.writeFileSync(
      path.join(compDir, 'Button.tsx'),
      `export interface ButtonProps { label: string; }
export function Button({ label }: ButtonProps) {
  return <button>{label}</button>;
}
`
    );

    // 2. Direct dependent: Modal imports Button
    fs.writeFileSync(
      path.join(compDir, 'Modal.tsx'),
      `import { Button } from './Button';
export function Modal() {
  return (
    <div>
      <Button label="Close" />
    </div>
  );
}
`
    );

    // 3. Transitive dependent: DashboardPage imports Modal
    fs.writeFileSync(
      path.join(pagesDir, 'Dashboard.tsx'),
      `import { Modal } from '../components/Modal';
export default function Dashboard() {
  return <Modal />;
}
`
    );

    // 4. Another route: Settings imports Button directly
    fs.writeFileSync(
      path.join(pagesDir, 'Settings.tsx'),
      `import { Button } from '../components/Button';
export default function Settings() {
  return <Button label="Save" />;
}
`
    );

    // Index repository
    await indexRepository(tmpDir);
    const index = getActiveIndex(tmpDir);

    // Test impact on symbol 'Button'
    const impact = index.traceImpact('Button');

    assert.equal(impact.target, 'Button');
    assert.equal(impact.kind, 'symbol');

    // Button is directly imported by Modal and Settings
    assert.ok(impact.directDependents.some((f) => f.includes('Modal.tsx')));
    assert.ok(impact.directDependents.some((f) => f.includes('Settings.tsx')));

    // DashboardPage is a transitive dependent (imported via Modal)
    assert.ok(impact.transitiveDependents.some((f) => f.includes('Dashboard.tsx')));

    // Connected routes include Settings and Dashboard
    assert.ok(impact.affectedRoutes.some((r) => r.includes('/settings') || r.includes('Settings.tsx')));
    assert.ok(impact.affectedRoutes.some((r) => r.includes('/dashboard') || r.includes('Dashboard.tsx')));

    // Risk level
    assert.ok(['MEDIUM', 'HIGH'].includes(impact.riskLevel));
    assert.ok(impact.summary.includes('Button'));
    assert.ok(impact.recommendations.length > 0);

    // Test impact on file path directly
    const fileImpact = index.traceImpact('src/components/Modal.tsx');
    assert.equal(fileImpact.kind, 'file');
    assert.ok(fileImpact.directDependents.some((f) => f.includes('Dashboard.tsx')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getContext: returns unified compact context for AI agent task', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-getcontext-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src', 'components');
    fs.mkdirSync(srcDir, { recursive: true });

    fs.writeFileSync(
      path.join(srcDir, 'Header.tsx'),
      `import React from 'react';
export function Header() {
  return (
    <header id="app-header" className="nav-bar bg-zinc-900 p-4">
      <span className="brand-logo font-bold">Acme Corp</span>
    </header>
  );
}
`
    );

    await indexRepository(tmpDir);

    const mockInspection = {
      url: 'https://example.com',
      title: 'Acme App',
      viewport: { width: 1440, height: 900 },
      palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 3 },
      typography: { fontFamilies: [], tokens: [] },
      critique: {
        score: 85,
        horizontalOverflow: false,
        totalUniqueColors: 3,
        paletteSprawl: false,
        aiTropesDetected: [],
        contrastIssues: [],
        spacingIssues: [
          {
            element: 'header',
            selector: '#app-header',
            property: 'padding',
            value: '17px',
            passesSystem: false
          }
        ],
        touchTargetIssues: [],
        occlusionIssues: [],
        summary: ['Off-grid spacing on #app-header']
      },
      layoutTree: { tag: 'header', classes: ['nav-bar'], rect: { x: 0, y: 0, width: 1440, height: 64 }, children: [] },
      interactiveElements: [
        {
          tag: 'header',
          selector: '#app-header',
          text: 'Acme Corp',
          rect: { x: 0, y: 0, width: 1440, height: 64 }
        }
      ]
    };

    const context = getContext({
      repoIdentifier: tmpDir,
      selector: '#app-header',
      textSnippet: 'Acme Corp',
      tag: 'header',
      inspectionResult: mockInspection
    });

    assert.equal(context.taskTarget.selector, '#app-header');
    assert.deepEqual(context.taskTarget.bounds, { x: 0, y: 0, width: 1440, height: 64 });
    assert.ok(context.taskTarget.issues && context.taskTarget.issues.length > 0);
    assert.ok(context.taskTarget.issues[0].includes('Off-grid spacing'));

    assert.ok(context.sourceCandidates.length > 0);
    assert.ok(context.sourceCandidates[0].file.includes('Header.tsx'));
    assert.ok(context.sourceCandidates[0].confidence > 0.7);

    assert.ok(context.impact.riskLevel);
    assert.ok(context.summary.includes('Header.tsx'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('HTTP Server: POST /api/trace-impact and /api/get-context endpoints work', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-http-impact-test-'));

  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'Widget.tsx'),
      `export function Widget() { return <div id="widget">Content</div>; }`
    );

    await indexRepository(tmpDir);

    const server = createHttpServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : 3000;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Test POST /api/trace-impact
      const impactRes = await fetch(`${baseUrl}/api/trace-impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'Widget', repoIdentifier: tmpDir })
      });
      assert.equal(impactRes.status, 200);
      const impactData = await impactRes.json();
      assert.equal(impactData.target, 'Widget');
      assert.equal(impactData.kind, 'symbol');
      assert.ok(impactData.riskLevel);

      // 2. Test POST /api/get-context
      const contextRes = await fetch(`${baseUrl}/api/get-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selector: '#widget',
          textSnippet: 'Content',
          repoIdentifier: tmpDir
        })
      });
      assert.equal(contextRes.status, 200);
      const contextData = await contextRes.json();
      assert.equal(contextData.taskTarget.selector, '#widget');
      assert.ok(contextData.sourceCandidates.length > 0);
      assert.ok(contextData.sourceCandidates[0].file.includes('Widget.tsx'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await closeBrowser();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
