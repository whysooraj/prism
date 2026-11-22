import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyChange } from '../dist/web/change-verifier.js';
import { createHttpServer } from '../dist/http.js';
import { closeBrowser } from '../dist/web/browser.js';

test('verifyChange: detects resolved defects and catches layout regression', () => {
  // 1. Before state: button has failing contrast ratio
  const beforeState = {
    url: 'https://example.com/app',
    title: 'App Before',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 5 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 75,
      horizontalOverflow: false,
      totalUniqueColors: 5,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [
        {
          element: 'button',
          selector: 'button.submit-btn',
          fg: '#777777',
          bg: '#ffffff',
          contrastRatio: 2.1,
          requiredRatio: 4.5,
          passesAA: false
        }
      ],
      spacingIssues: [],
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: ['Failing WCAG contrast']
    },
    layoutTree: {
      tag: 'div',
      classes: ['container'],
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: [
      {
        tag: 'button',
        selector: 'button.submit-btn',
        text: 'Submit Order',
        rect: { x: 100, y: 200, width: 150, height: 44 }
      }
    ]
  };

  // 2. After state: contrast is fixed, but button shifted down by 25px (layout shift regression)
  const afterState = {
    url: 'https://example.com/app',
    title: 'App After',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 5 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 95,
      horizontalOverflow: false,
      totalUniqueColors: 5,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [], // Contrast resolved!
      spacingIssues: [],
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: ['Passing WCAG contrast']
    },
    layoutTree: {
      tag: 'div',
      classes: ['container'],
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: [
      {
        tag: 'button',
        selector: 'button.submit-btn',
        text: 'Submit Order',
        rect: { x: 100, y: 225, width: 150, height: 44 } // shifted by +25px on Y
      }
    ]
  };

  const result = verifyChange(beforeState, afterState);

  // Assertions:
  // - Contrast defect successfully marked as resolved
  assert.equal(result.resolvedDefects.length, 1);
  assert.ok(result.resolvedDefects[0].includes('button.submit-btn'));

  // - Layout shift caught: button shifted unexpectedly by 25px
  assert.equal(result.layoutShifts.length, 1);
  assert.equal(result.layoutShifts[0].selector, 'button.submit-btn');
  assert.equal(result.layoutShifts[0].deltaX, 0);
  assert.equal(result.layoutShifts[0].deltaY, 25);

  // - Verdict flagged as REGRESSION due to unintended layout movement
  assert.equal(result.verdict, 'REGRESSION');
  assert.equal(result.scoreDelta, 20);
  assert.equal(result.beforeScore, 75);
  assert.equal(result.afterScore, 95);
  assert.ok(result.summary.includes('REGRESSION'));
});

test('verifyChange: clean fix with no layout shifts yields PASSED', () => {
  const beforeState = {
    url: 'https://example.com',
    title: 'Before',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 4 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 80,
      horizontalOverflow: true, // critical defect
      totalUniqueColors: 4,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [],
      spacingIssues: [],
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: []
    },
    layoutTree: {
      tag: 'div',
      id: 'app-root',
      classes: [],
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: []
  };

  const afterState = {
    url: 'https://example.com',
    title: 'After',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 4 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 100,
      horizontalOverflow: false, // fixed!
      totalUniqueColors: 4,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [],
      spacingIssues: [],
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: []
    },
    layoutTree: {
      tag: 'div',
      id: 'app-root',
      classes: [],
      rect: { x: 0, y: 0, width: 1440, height: 900 }, // fits viewport
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: []
  };

  const result = verifyChange(beforeState, afterState);
  assert.equal(result.verdict, 'PASSED');
  assert.equal(result.scoreDelta, 20);
  assert.equal(result.resolvedDefects.length, 1);
  assert.ok(result.resolvedDefects[0].toLowerCase().includes('horizontal layout overflow'));
  assert.equal(result.newRegressions.length, 0);
  assert.ok(result.summary.includes('PASSED'));
});

test('verifyChange: partial fix yields PARTIAL_FIX', () => {
  const beforeState = {
    url: 'https://example.com',
    title: 'Before',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 4 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 70,
      horizontalOverflow: false,
      totalUniqueColors: 4,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [
        {
          element: 'span',
          selector: 'span.badge',
          fg: '#999',
          bg: '#fff',
          contrastRatio: 2.5,
          requiredRatio: 4.5,
          passesAA: false
        }
      ],
      spacingIssues: [
        {
          element: 'section',
          selector: 'section.hero',
          property: 'padding-top',
          value: '19px',
          offGridReason: 'Off 4/8pt grid'
        }
      ],
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: []
    },
    layoutTree: {
      tag: 'body',
      classes: [],
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: []
  };

  // After state fixes spacing, but contrast issue still remains
  const afterState = {
    url: 'https://example.com',
    title: 'After',
    viewport: { width: 1440, height: 900 },
    palette: { backgrounds: [], textColors: [], accents: [], totalUniqueColors: 4 },
    typography: { fontFamilies: [], tokens: [] },
    critique: {
      score: 85,
      horizontalOverflow: false,
      totalUniqueColors: 4,
      paletteSprawl: false,
      aiTropesDetected: [],
      contrastIssues: [
        {
          element: 'span',
          selector: 'span.badge',
          fg: '#999',
          bg: '#fff',
          contrastRatio: 2.5,
          requiredRatio: 4.5,
          passesAA: false
        }
      ],
      spacingIssues: [], // Fixed!
      touchTargetIssues: [],
      occlusionIssues: [],
      summary: []
    },
    layoutTree: {
      tag: 'body',
      classes: [],
      rect: { x: 0, y: 0, width: 1440, height: 900 },
      boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: 1440, height: 900 },
      styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
      children: []
    },
    interactiveElements: []
  };

  const result = verifyChange(beforeState, afterState);
  assert.equal(result.verdict, 'PARTIAL_FIX');
  assert.equal(result.scoreDelta, 15);
  assert.equal(result.resolvedDefects.length, 1);
  assert.ok(result.resolvedDefects[0].includes('Off-grid spacing'));
  assert.equal(result.newRegressions.length, 0);
});

test('HTTP Server POST /api/verify-change handles pre-inspected payloads', async () => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const beforePayload = {
      url: 'https://example.com/test',
      critique: { score: 70, contrastIssues: [{ selector: '#txt', passesAA: false, contrastRatio: 2, requiredRatio: 4.5 }] },
      layoutTree: { tag: 'body', classes: [], rect: { x: 0, y: 0, width: 100, height: 100 }, children: [] },
      interactiveElements: [{ selector: '#btn', rect: { x: 10, y: 10, width: 80, height: 30 } }]
    };

    const afterPayload = {
      url: 'https://example.com/test',
      critique: { score: 100, contrastIssues: [] },
      layoutTree: { tag: 'body', classes: [], rect: { x: 0, y: 0, width: 100, height: 100 }, children: [] },
      interactiveElements: [{ selector: '#btn', rect: { x: 10, y: 10, width: 80, height: 30 } }]
    };

    const res = await fetch(`${baseUrl}/api/verify-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ before: beforePayload, after: afterPayload })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.verdict, 'PASSED');
    assert.equal(data.scoreDelta, 30);
    assert.equal(data.resolvedDefects.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeBrowser();
  }
});

test('HTTP Server POST /api/verify-change with live beforeUrl and afterUrl data URLs', async () => {
  const server = createHttpServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = address && typeof address === 'object' ? address.port : 3000;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const htmlBefore = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1 style="color: #777777; background: #ffffff;">Low Contrast Title</h1>
          <button id="cta" style="margin-top: 10px; width: 100px; height: 40px;">Click Me</button>
        </body>
      </html>
    `;
    const beforeDataUrl = `data:text/html;base64,${Buffer.from(htmlBefore).toString('base64')}`;

    const htmlAfter = `
      <!DOCTYPE html>
      <html>
        <body>
          <h1 style="color: #000000; background: #ffffff;">High Contrast Title</h1>
          <button id="cta" style="margin-top: 10px; width: 100px; height: 40px;">Click Me</button>
        </body>
      </html>
    `;
    const afterDataUrl = `data:text/html;base64,${Buffer.from(htmlAfter).toString('base64')}`;

    const res = await fetch(`${baseUrl}/api/verify-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beforeUrl: beforeDataUrl, afterUrl: afterDataUrl, allowLocalhost: true })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(['PASSED', 'PARTIAL_FIX'].includes(data.verdict));
    assert.ok(data.scoreDelta >= 0);
    assert.ok(Array.isArray(data.resolvedDefects));
    assert.ok(Array.isArray(data.newRegressions));
    assert.ok(Array.isArray(data.layoutShifts));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await closeBrowser();
  }
});

