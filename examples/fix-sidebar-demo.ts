import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { inspectWebsite } from '../src/web/page-inspector.js';
import { findUiSource } from '../src/correlation/correlator.js';
import { verifyChange } from '../src/web/change-verifier.js';
import { indexRepository, getActiveIndex } from '../src/repo/repo-inspector.js';

/**
 * End-to-End Autonomous Frontend Debugging Loop Demo:
 * "Find why the dashboard sidebar is misaligned and verify the fix."
 *
 * 1. Capture/Inspect Dashboard UI (Detect visual/layout anomaly)
 * 2. Correlate misaligned DOM element to source component via find_ui_source
 * 3. Trace component dependencies and styles via trace_symbol
 * 4. Apply surgical fix to component
 * 5. Re-inspect and verify fix with verify_change (ensuring no regressions)
 */
async function runDemo() {
  console.log('=== Prism Autonomous UI Comprehension & Fix Loop ===\n');

  // Create temporary mock repository representing a React/Next.js dashboard app
  const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'prism-demo-repo-'));
  const srcDir = path.join(tmpRepo, 'src', 'components');
  fs.mkdirSync(srcDir, { recursive: true });

  const sidebarFile = path.join(srcDir, 'Sidebar.tsx');
  fs.writeFileSync(
    sidebarFile,
    `import React from 'react';
import { NavItem } from './NavItem';

export interface SidebarProps {
  collapsed?: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  // Defective: padding-left 3px causes layout asymmetry and touch target clipping
  return (
    <aside id="main-sidebar" className="sidebar-container bg-slate-900 w-64 p-3" style={{ paddingLeft: '3px' }}>
      <div className="sidebar-header font-bold text-white mb-4">Dashboard</div>
      <nav className="sidebar-nav">
        <NavItem label="Analytics" href="/analytics" />
        <NavItem label="Settings" href="/settings" />
      </nav>
    </aside>
  );
}
`
  );

  const navItemFile = path.join(srcDir, 'NavItem.tsx');
  fs.writeFileSync(
    navItemFile,
    `import React from 'react';

export function NavItem({ label, href }: { label: string; href: string }) {
  return <a className="nav-link block py-2 text-zinc-300" href={href}>{label}</a>;
}
`
  );

  try {
    // Step 1: Index the repository with Prism
    console.log('[Step 1] Indexing local repository...');
    const repoSummary = await indexRepository(tmpRepo);
    console.log(`Indexed ${repoSummary.totalFiles} files, ${repoSummary.totalSymbols} symbols.\n`);

    // Step 2: Inspect running application UI (Simulating defective state)
    console.log('[Step 2] Inspecting running application with inspect_website...');
    const defectiveHtml = `<!DOCTYPE html>
    <html>
      <head>
        <style>
          body { margin: 0; display: flex; font-family: sans-serif; }
          #main-sidebar { width: 256px; height: 100vh; background: #0f172a; padding: 3px; box-sizing: border-box; }
          .sidebar-header { color: #ffffff; font-size: 16px; margin-bottom: 16px; }
          .nav-link { display: block; height: 20px; color: #cbd5e1; text-decoration: none; padding: 2px; }
        </style>
      </head>
      <body>
        <aside id="main-sidebar" class="sidebar-container">
          <div class="sidebar-header">Dashboard</div>
          <nav class="sidebar-nav">
            <a class="nav-link" href="/analytics">Analytics</a>
            <a class="nav-link" href="/settings">Settings</a>
          </nav>
        </aside>
        <main style="flex: 1; padding: 24px;"><h1>Dashboard Content</h1></main>
      </body>
    </html>`;

    const beforeInspection = await inspectWebsite({
      url: `data:text/html,${encodeURIComponent(defectiveHtml)}`,
      allowLocalhost: true,
      includeA11y: true,
    });

    console.log(`Audited layout: ${beforeInspection.interactiveElements.length} interactive elements detected.`);
    console.log(`Design Health Score: ${beforeInspection.critique.score}/100`);
    if (beforeInspection.critique.summary?.length) {
      console.log('Design Issues:');
      for (const item of beforeInspection.critique.summary) {
        console.log(`  - ${item}`);
      }
    }
    console.log('');

    // Step 3: Connect visible element to source component via find_ui_source
    console.log('[Step 3] Correlating visual defect to source component via find_ui_source...');
    const correlation = findUiSource({
      repoIdentifier: tmpRepo,
      selector: '#main-sidebar',
      tag: 'aside',
      textSnippet: 'Dashboard',
    });

    assert(correlation.sourceCandidates.length > 0, 'Must identify source candidate');
    const primaryCandidate = correlation.sourceCandidates[0];
    console.log(`Primary candidate: ${primaryCandidate.file} (symbol: ${primaryCandidate.symbol}, confidence: ${(primaryCandidate.confidence * 100).toFixed(0)}%)`);
    console.log(`Evidence: ${primaryCandidate.evidence.join('; ')}\n`);

    // Step 4: Trace symbol dependencies and callers
    console.log(`[Step 4] Tracing symbol '${primaryCandidate.symbol}'...`);
    const trace = getActiveIndex(tmpRepo).traceSymbol(primaryCandidate.symbol!);
    const def = trace.definitions[0];
    console.log(`Definition at: ${def?.filePath}:${def?.startLine}`);
    console.log(`Imported by: ${trace.importedBy.join(', ') || 'none'}`);
    console.log(`Callees: ${trace.callees.map(c => c.name).join(', ') || 'none'}\n`);

    // Step 5: Make targeted code change (Fix the padding and touch target heights)
    console.log('[Step 5] Applying surgical fix to Sidebar.tsx...');
    const fixedContent = fs.readFileSync(sidebarFile, 'utf8')
      .replace("style={{ paddingLeft: '3px' }}", "style={{ padding: '16px' }}")
      .replace('p-3', 'p-4');
    fs.writeFileSync(sidebarFile, fixedContent);
    console.log('Fix applied.\n');

    // Step 6: Verify change against updated UI state
    console.log('[Step 6] Re-inspecting UI and executing verify_change...');
    const fixedHtml = `<!DOCTYPE html>
    <html>
      <head>
        <style>
          body { margin: 0; display: flex; font-family: sans-serif; }
          #main-sidebar { width: 256px; height: 100vh; background: #0f172a; padding: 16px; box-sizing: border-box; }
          .sidebar-header { color: #ffffff; font-size: 16px; margin-bottom: 16px; }
          .nav-link { display: block; height: 44px; line-height: 44px; color: #cbd5e1; text-decoration: none; padding: 0 8px; }
        </style>
      </head>
      <body>
        <aside id="main-sidebar" class="sidebar-container">
          <div class="sidebar-header">Dashboard</div>
          <nav class="sidebar-nav">
            <a class="nav-link" href="/analytics">Analytics</a>
            <a class="nav-link" href="/settings">Settings</a>
          </nav>
        </aside>
        <main style="flex: 1; padding: 24px;"><h1>Dashboard Content</h1></main>
      </body>
    </html>`;

    const afterInspection = await inspectWebsite({
      url: `data:text/html,${encodeURIComponent(fixedHtml)}`,
      allowLocalhost: true,
      includeA11y: true,
    });

    const verification = verifyChange(beforeInspection, afterInspection, {
      allowedShiftSelectors: ['#main-sidebar', 'aside', '.nav-link', '.sidebar-container']
    });
    console.log(`Verification Verdict: ${verification.verdict} (Score delta: ${verification.scoreDelta >= 0 ? '+' : ''}${verification.scoreDelta})`);
    console.log(`Before Score: ${verification.beforeScore}/100 -> After Score: ${verification.afterScore}/100`);
    console.log(`Resolved defects: ${verification.resolvedDefects.length}`);
    for (const resolved of verification.resolvedDefects) {
      console.log(`  + Resolved: ${resolved}`);
    }
    console.log(`New regressions: ${verification.newRegressions.length}`);
    console.log(`Layout shifts: ${verification.layoutShifts.length}`);
    console.log(`Summary: ${verification.summary}\n`);

    assert(verification.verdict === 'PASSED' || verification.verdict === 'PARTIAL_FIX', 'Verification must not be REGRESSION');
    console.log('=== Demo Completed Successfully: Complete Context-to-Verify Loop Validated ===');
  } finally {
    fs.rmSync(tmpRepo, { recursive: true, force: true });
  }
}

runDemo().catch((err) => {
  console.error('Demo error:', err);
  process.exit(1);
});
