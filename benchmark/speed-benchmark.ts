import { inspectWebsite, captureScreenshots } from '../dist/web/page-inspector.js';
import { closeBrowser } from '../dist/web/browser.js';
import { indexRepository, getActiveIndex } from '../dist/repo/repo-inspector.js';
import * as path from 'path';

export interface SpeedMetric {
  operation: string;
  durationMs: number;
  memoryMb: number;
  tokensEstimated: {
    prism: number;
    rawHtmlOrFullText: number;
    visionScreenshotTokens: number;
    tokenSavingsPercent: number;
  };
}

export async function runSpeedBenchmark(): Promise<{
  webBenchmarks: SpeedMetric[];
  repoBenchmarks: SpeedMetric[];
  summary: {
    avgWebLatencyMs: number;
    avgRepoThroughputFilesPerSec: number;
    avgTokenSavingsPercent: number;
  };
}> {
  const webBenchmarks: SpeedMetric[] = [];
  const repoBenchmarks: SpeedMetric[] = [];

  // Standard token estimate heuristic: ~4 chars per token for text/JSON
  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Vision model token pricing (OpenAI / Anthropic standard 1440x900 tiles):
  // 1440x900 -> 3x2 tiles of 512x512 = 6 tiles * 170 + 85 base = 1105 tokens for OpenAI, ~1600 for Anthropic
  const SCREENSHOT_VISION_TOKENS = 1400;

  // 1. Web Benchmark on Mock SaaS Landing Page
  const saasHtml = `
    <!DOCTYPE html><html><head><style>
      body { margin: 0; background: #09090b; color: #fafafa; font-family: sans-serif; }
      .nav { height: 64px; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; }
      .hero { padding: 64px 32px; display: flex; flex-direction: column; gap: 24px; align-items: center; text-align: center; }
      h1 { font-size: 48px; line-height: 56px; margin: 0; font-weight: 700; }
      p { font-size: 16px; line-height: 24px; color: #a1a1aa; max-width: 600px; margin: 0; }
      .btn { background: #3b82f6; color: #fff; padding: 12px 24px; border-radius: 6px; border: none; font-size: 16px; min-height: 44px; min-width: 120px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; padding: 32px; }
      .card { background: #18181b; border: 1px solid #27272a; padding: 16px; border-radius: 8px; }
    </style></head><body>
      <div class="nav"><span>Brand</span><button class="btn">Login</button></div>
      <div class="hero"><h1>Autonomous Infrastructure</h1><p>Deterministic layout extraction for agents.</p><button class="btn">Deploy</button></div>
      <div class="grid">
        <div class="card"><h3>Fast</h3><p>Zero wait time</p></div>
        <div class="card"><h3>Deterministic</h3><p>Exact bounding boxes</p></div>
        <div class="card"><h3>Low Token</h3><p>No bloated OCR</p></div>
      </div>
    </body></html>
  `;
  const dataUrl = `data:text/html;base64,${Buffer.from(saasHtml).toString('base64')}`;

  const memStart = process.memoryUsage().heapUsed;
  const webT0 = performance.now();

  const webResult = await inspectWebsite({
    url: dataUrl,
    viewport: { width: 1440, height: 900 },
    allowLocalhost: true,
    includeWireframeSvg: true
  });

  const webDuration = performance.now() - webT0;
  const memEnd = process.memoryUsage().heapUsed;

  const prismJson = JSON.stringify({
    critique: webResult.critique,
    palette: webResult.palette,
    typography: webResult.typography,
    interactiveElements: webResult.interactiveElements,
    radar: webResult.asciiRadar
  });

  const prismTokens = estimateTokens(prismJson);
  const rawHtmlTokens = estimateTokens(saasHtml);
  const tokenSavings = Math.round(((SCREENSHOT_VISION_TOKENS - prismTokens) / SCREENSHOT_VISION_TOKENS) * 100);

  webBenchmarks.push({
    operation: 'Web Layout & Design Intelligence (SaaS Page)',
    durationMs: Math.round(webDuration * 100) / 100,
    memoryMb: Math.round(((memEnd - memStart) / (1024 * 1024)) * 100) / 100,
    tokensEstimated: {
      prism: prismTokens,
      rawHtmlOrFullText: rawHtmlTokens,
      visionScreenshotTokens: SCREENSHOT_VISION_TOKENS,
      tokenSavingsPercent: Math.max(0, tokenSavings)
    }
  });

  // 2. High-Density Enterprise Dashboard Benchmark
  const dashHtml = `
    <!DOCTYPE html><html><head><style>
      body { margin: 0; background: #09090b; color: #f4f4f5; font-family: sans-serif; }
      .container { padding: 32px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
      .card { background: #18181b; border: 1px solid #27272a; padding: 16px; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 12px 16px; border-bottom: 1px solid #27272a; text-align: left; }
    </style></head><body>
      <div class="container">
        <div class="grid">
          ${Array.from({ length: 8 }, (_, i) => `<div class="card"><h4>Metric ${i}</h4><p>Value ${i * 100}</p></div>`).join('')}
        </div>
        <table>
          <thead><tr><th>ID</th><th>Service</th><th>Latency</th><th>Status</th></tr></thead>
          <tbody>
            ${Array.from({ length: 20 }, (_, i) => `<tr><td>#${i}</td><td>Service ${i}</td><td>${i * 2}ms</td><td>Active</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </body></html>
  `;
  const dashDataUrl = `data:text/html;base64,${Buffer.from(dashHtml).toString('base64')}`;

  const dashT0 = performance.now();
  const dashResult = await inspectWebsite({
    url: dashDataUrl,
    viewport: { width: 1440, height: 900 },
    allowLocalhost: true,
    includeWireframeSvg: true
  });
  const dashDuration = performance.now() - dashT0;

  const dashPrismJson = JSON.stringify({
    critique: dashResult.critique,
    radar: dashResult.asciiRadar,
    interactiveElements: dashResult.interactiveElements
  });
  const dashPrismTokens = estimateTokens(dashPrismJson);
  const dashRawTokens = estimateTokens(dashHtml);
  const dashSavings = Math.round(((SCREENSHOT_VISION_TOKENS - dashPrismTokens) / SCREENSHOT_VISION_TOKENS) * 100);

  webBenchmarks.push({
    operation: 'Web Layout & Design Intelligence (Dense Dashboard)',
    durationMs: Math.round(dashDuration * 100) / 100,
    memoryMb: Math.round(((process.memoryUsage().heapUsed - memEnd) / (1024 * 1024)) * 100) / 100,
    tokensEstimated: {
      prism: dashPrismTokens,
      rawHtmlOrFullText: dashRawTokens,
      visionScreenshotTokens: SCREENSHOT_VISION_TOKENS,
      tokenSavingsPercent: Math.max(0, dashSavings)
    }
  });

  await closeBrowser();

  // 3. Repository Indexing Speed Benchmark (Prism self-index)
  const repoRoot = path.resolve(process.cwd());
  const repoT0 = performance.now();
  const repoSummary = await indexRepository(repoRoot);
  const repoDuration = performance.now() - repoT0;

  const index = getActiveIndex();
  const totalSymbols = repoSummary.totalSymbols;
  const totalFiles = repoSummary.totalFiles;
  const filesPerSec = Math.round((totalFiles / (repoDuration / 1000)) * 10) / 10;
  const symbolsPerSec = Math.round((totalSymbols / (repoDuration / 1000)) * 10) / 10;

  // Compare surgical symbol lookup tokens vs reading full files (e.g. repomix dump)
  const sampleTrace = index.traceSymbol('inspectWebsite');
  const traceJson = JSON.stringify(sampleTrace);
  const traceTokens = estimateTokens(traceJson);
  // Full codebase tokens in raw concatenation (repomix style):
  const rawRepoTokens = totalFiles * 450; // avg ~450 tokens per TS file

  repoBenchmarks.push({
    operation: `Repository AST Indexing (${totalFiles} files, ${totalSymbols} symbols)`,
    durationMs: Math.round(repoDuration * 100) / 100,
    memoryMb: Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 100) / 100,
    tokensEstimated: {
      prism: traceTokens,
      rawHtmlOrFullText: rawRepoTokens,
      visionScreenshotTokens: 0,
      tokenSavingsPercent: Math.round(((rawRepoTokens - traceTokens) / rawRepoTokens) * 100)
    }
  });

  const avgWebLatency = (webBenchmarks[0].durationMs + webBenchmarks[1].durationMs) / 2;
  const avgTokenSavings = (webBenchmarks[0].tokensEstimated.tokenSavingsPercent + webBenchmarks[1].tokensEstimated.tokenSavingsPercent) / 2;

  return {
    webBenchmarks,
    repoBenchmarks,
    summary: {
      avgWebLatencyMs: Math.round(avgWebLatency * 10) / 10,
      avgRepoThroughputFilesPerSec: filesPerSec,
      avgTokenSavingsPercent: Math.round(avgTokenSavings)
    }
  };
}

if (process.argv[1] && process.argv[1].includes('speed-benchmark')) {
  runSpeedBenchmark()
    .then((res) => {
      console.log('\n=== Prism Performance & Speed Benchmark Report ===\n');
      console.log('--- Web Inspection Latency & Token Efficiency ---');
      for (const w of res.webBenchmarks) {
        console.log(`[${w.operation}]`);
        console.log(`  - Latency: ${w.durationMs}ms`);
        console.log(`  - Prism Tokens: ${w.tokensEstimated.prism}`);
        console.log(`  - Vision Screenshot Tokens: ~${w.tokensEstimated.visionScreenshotTokens}`);
        console.log(`  - Raw HTML Tokens: ~${w.tokensEstimated.rawHtmlOrFullText}`);
        console.log(`  - Token Savings vs Vision: ${w.tokensEstimated.tokenSavingsPercent}%\n`);
      }

      console.log('--- Repository AST Indexing Performance ---');
      for (const r of res.repoBenchmarks) {
        console.log(`[${r.operation}]`);
        console.log(`  - Total Index Time: ${r.durationMs}ms`);
        console.log(`  - Surgical Trace Query Tokens: ${r.tokensEstimated.prism} tokens`);
        console.log(`  - Full Repo Text Dump Tokens: ~${r.tokensEstimated.rawHtmlOrFullText} tokens`);
        console.log(`  - Token Savings: ${r.tokensEstimated.tokenSavingsPercent}%\n`);
      }

      console.log('--- Overall Summary ---');
      console.log(`  - Average Web Inspection Latency: ${res.summary.avgWebLatencyMs}ms`);
      console.log(`  - Repo Ingestion Throughput: ${res.summary.avgRepoThroughputFilesPerSec} files/sec`);
      console.log(`  - Average Token Reduction: ${res.summary.avgTokenSavingsPercent}%`);
    })
    .catch((err) => {
      console.error('Benchmark failed:', err);
      process.exit(1);
    });
}
