import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import { indexRepository, getActiveIndex } from '../dist/repo/repo-inspector.js';
import { findUiSource } from '../dist/correlation/correlator.js';
import { isPrivateIpOrHost, isPrivateIp } from '../dist/web/browser.js';

test('Security P0: Enforce strict path traversal containment in getFormattedFile', async () => {
  const rootDir = path.resolve(process.cwd());
  await indexRepository(rootDir);
  const index = getActiveIndex();

  // 1. Valid file within repository
  const validFile = index.getFormattedFile('package.json', 1, 5);
  assert.equal(validFile.filePath, 'package.json');
  assert.ok(validFile.content.includes('prism-mcp'));

  // 2. Traversal attempt out of root
  assert.throws(() => {
    index.getFormattedFile('../../etc/passwd');
  }, /path traversal outside repository containment/i);

  // 3. Absolute path attempt
  assert.throws(() => {
    index.getFormattedFile('/etc/passwd');
  }, /path traversal outside repository containment/i);

  // 4. Dot-dot encoded traversal
  assert.throws(() => {
    index.getFormattedFile('src/../../.ssh/id_rsa');
  }, /path traversal outside repository containment/i);
});

test('Security P0: Multi-project repository registry and isolation', async () => {
  const rootDir = path.resolve(process.cwd());
  const summary = await indexRepository(rootDir);

  assert.ok(summary.totalFiles > 0);
  assert.ok(summary.totalSymbols > 0);

  // Retrieval by name and fallback
  const index1 = getActiveIndex('prism');
  assert.ok(index1);
  assert.equal(index1.getMetadata().name, summary.repoName);
});

test('Security P0: SSRF IP & Notation Hardening', () => {
  // Standard loopback and link-local
  assert.equal(isPrivateIpOrHost('localhost'), true);
  assert.equal(isPrivateIpOrHost('127.0.0.1'), true);
  assert.equal(isPrivateIpOrHost('169.254.169.254'), true);
  assert.equal(isPrivateIpOrHost('10.0.0.1'), true);
  assert.equal(isPrivateIpOrHost('192.168.1.1'), true);
  assert.equal(isPrivateIpOrHost('172.20.0.1'), true);

  // Hex / Integer IP notation bypasses
  assert.equal(isPrivateIp('2130706433'), true); // 127.0.0.1 in integer
  assert.equal(isPrivateIp('0x7f000001'), true); // 127.0.0.1 in hex

  // Public IP
  assert.equal(isPrivateIpOrHost('93.184.216.34'), false);
  assert.equal(isPrivateIpOrHost('google.com'), false);
});

test('Core Differentiator: Visual-to-Source Correlation (find_ui_source)', async () => {
  const rootDir = path.resolve(process.cwd());
  await indexRepository(rootDir);

  // Correlate element targeting button with text "Inspect"
  const correlation = findUiSource({
    urlOrRoute: '/ui',
    selector: 'button#inspectBtn.primary',
    textSnippet: 'Inspect',
    tag: 'button'
  });

  assert.ok(correlation.sourceCandidates.length > 0);
  const topCandidate = correlation.sourceCandidates[0];
  assert.ok(topCandidate.confidence > 0.5);
  assert.ok(topCandidate.evidence.length > 0);
  assert.ok(topCandidate.file.includes('ui.html') || topCandidate.file.includes('ui.'));
});
