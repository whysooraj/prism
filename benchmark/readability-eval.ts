import * as fs from 'fs';
import * as path from 'path';
import { inspectWebsite, captureScreenshots } from '../dist/web/page-inspector.js';
import { closeBrowser } from '../dist/web/browser.js';

export interface BenchmarkCase {
  id: string;
  name: string;
  html: string;
  expectedIssues: {
    contrastFailures?: number;
    spacingDeviations?: number;
    touchTargetViolations?: number;
    occlusionFailures?: number;
    horizontalOverflow?: boolean;
    aiTropes?: number;
  };
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  // 1. Clean 8pt SaaS Landing Page
  {
    id: 'clean-saas',
    name: 'Precision 8pt SaaS Hero',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #09090b; color: #fafafa; font-family: sans-serif; }
        .nav { height: 64px; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
        .hero { padding: 64px 32px; display: flex; flex-direction: column; gap: 24px; align-items: center; text-align: center; }
        h1 { font-size: 48px; line-height: 56px; margin: 0; font-weight: 700; }
        p { font-size: 16px; line-height: 24px; color: #a1a1aa; max-width: 600px; margin: 0; }
        .btn { background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 6px; border: none; font-size: 16px; min-height: 44px; min-width: 120px; }
      </style></head><body>
        <div class="nav"><span>Brand</span><button class="btn">Login</button></div>
        <div class="hero"><h1>Autonomous Infrastructure</h1><p>Deterministic layout extraction for agents.</p><button class="btn">Deploy</button></div>
      </body></html>
    `,
    expectedIssues: { contrastFailures: 0, spacingDeviations: 0, touchTargetViolations: 0, horizontalOverflow: false, aiTropes: 0 }
  },

  // 2. Chaotic / Broken UI (Off-grid, bad contrast, horizontal blowout)
  {
    id: 'broken-ui',
    name: 'Broken Spacing & Contrast Defects',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #0f172a; color: #1e293b; /* Dark on dark -> WCAG fail */ font-family: sans-serif; }
        .wide-box { width: 1600px; /* Blows out 1440px desktop */ height: 40px; background: #334155; }
        .off-grid-card { padding: 13px 21px; margin: 7px; background: #1e293b; color: #334155; }
        .tiny-btn { width: 22px; height: 18px; font-size: 10px; background: #6366f1; color: #fff; border: none; }
        .ai-slop-card {
          background-image: linear-gradient(to right, rgb(147, 51, 234), rgb(79, 70, 229));
          border-radius: 16px;
          box-shadow: 0 10px 25px rgba(168, 85, 247, 0.4);
          padding: 24px;
        }
      </style></head><body>
        <div class="wide-box">Horizontal blowout</div>
        <div class="off-grid-card"><p>Bad contrast text</p><button class="tiny-btn">x</button></div>
        <div class="ai-slop-card">AI Gradient Slop Card</div>
      </body></html>
    `,
    expectedIssues: { contrastFailures: 1, spacingDeviations: 2, touchTargetViolations: 1, horizontalOverflow: true, aiTropes: 1 }
  },

  // 3. Stacking Context & Layer Occlusion Defect
  {
    id: 'layer-occlusion',
    name: 'Layer Occlusion Defect',
    html: `
      <!DOCTYPE html><html><head><style>
        body { margin: 0; background: #fff; font-family: sans-serif; }
        .underneath-btn { position: absolute; top: 20px; left: 20px; width: 120px; height: 48px; background: #3b82f6; color: #fff; z-index: 1; }
        .floating-overlay { position: absolute; top: 0; left: 0; width: 200px; height: 100px; background: rgba(0,0,0,0.8); z-index: 99; color: #fff; padding: 16px; }
      </style></head><body>
        <button class="underneath-btn">Hidden CTA</button>
        <div class="floating-overlay">Blocking Modal Banner</div>
      </body></html>
    `,
    expectedIssues: { occlusionFailures: 1 }
  }
];

export async function runBenchmark(): Promise<{
  totalCases: number;
  overallReadabilityIndex: number;
  results: Array<{ id: string; name: string; score: number; fidelity: number; detectedDiscrepancies: string[] }>;
}> {
  const results = [];
  let totalScore = 0;

  for (const tc of BENCHMARK_CASES) {
    const dataUrl = `data:text/html;base64,${Buffer.from(tc.html).toString('base64')}`;
    const inspection = await inspectWebsite({
      url: dataUrl,
      viewport: { width: 1440, height: 900 },
      allowLocalhost: true,
      includeWireframeSvg: true
    });

    const discrepancies: string[] = [];

    // Verify contrast detection accuracy
    const actualContrastFails = inspection.critique.contrastIssues.filter((c) => !c.passesAA).length;
    if (tc.expectedIssues.contrastFailures !== undefined && actualContrastFails < tc.expectedIssues.contrastFailures) {
      discrepancies.push(`Missed ${tc.expectedIssues.contrastFailures - actualContrastFails} contrast defects`);
    }

    // Verify spacing grid detection
    const actualSpacingFails = inspection.critique.spacingIssues.length;
    if (tc.expectedIssues.spacingDeviations !== undefined && actualSpacingFails < tc.expectedIssues.spacingDeviations) {
      discrepancies.push(`Missed ${tc.expectedIssues.spacingDeviations - actualSpacingFails} off-grid spacing values`);
    }

    // Verify horizontal overflow detection
    if (tc.expectedIssues.horizontalOverflow !== undefined && inspection.critique.horizontalOverflow !== tc.expectedIssues.horizontalOverflow) {
      discrepancies.push(`Failed horizontal overflow check (expected ${tc.expectedIssues.horizontalOverflow}, got ${inspection.critique.horizontalOverflow})`);
    }

    // Verify occlusion detection
    const actualOcclusionFails = inspection.critique.occlusionIssues.length;
    if (tc.expectedIssues.occlusionFailures !== undefined && actualOcclusionFails < tc.expectedIssues.occlusionFailures) {
      discrepancies.push(`Missed ${tc.expectedIssues.occlusionFailures - actualOcclusionFails} layer occlusion defects`);
    }

    // Calculate AI Readability / Comprehension Fidelity (100 - penalties for missed defects)
    const fidelity = Math.max(0, 100 - discrepancies.length * 20);
    totalScore += fidelity;

    results.push({
      id: tc.id,
      name: tc.name,
      score: inspection.critique.score,
      fidelity,
      detectedDiscrepancies: discrepancies
    });
  }

  await closeBrowser();

  const overallReadabilityIndex = Math.round(totalScore / BENCHMARK_CASES.length);

  return {
    totalCases: BENCHMARK_CASES.length,
    overallReadabilityIndex,
    results
  };
}

// CLI execution
if (process.argv[1] && process.argv[1].includes('benchmark')) {
  runBenchmark()
    .then((report) => {
      console.log('=== Prism AI UI Readability & Benchmark Report ===');
      console.log(`Overall Comprehension Index: ${report.overallReadabilityIndex}%`);
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
