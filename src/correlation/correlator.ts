import * as fs from 'fs';
import * as path from 'path';
import { getActiveIndex } from '../repo/repo-inspector.js';
import type { RouteDefinition, CompactTaskContext, WebInspectionResult } from '../types.js';

export interface SourceCandidate {
  file: string;
  symbol?: string;
  startLine?: number;
  endLine?: number;
  confidence: number;
  evidence: string[];
}

export interface UiSourceCorrelationResult {
  selector: string;
  tag?: string;
  textSnippet?: string;
  matchedRoute?: string;
  routeFile?: string;
  sourceCandidates: SourceCandidate[];
  relatedFiles: string[];
}

export interface FindUiSourceOptions {
  urlOrRoute?: string;
  selector?: string;
  textSnippet?: string;
  tag?: string;
  repoIdentifier?: string;
}

export function findUiSource(options: FindUiSourceOptions): UiSourceCorrelationResult {
  const {
    urlOrRoute = '/',
    selector = '',
    textSnippet = '',
    tag = '',
    repoIdentifier
  } = options;

  const index = getActiveIndex(repoIdentifier);
  const metadata = index.getMetadata();
  const fileTree = index.getFileTree();
  const routes = index.getRoutes();

  // 1. Resolve pathname from URL
  let pathname = urlOrRoute;
  try {
    if (urlOrRoute.startsWith('http://') || urlOrRoute.startsWith('https://')) {
      const u = new URL(urlOrRoute);
      pathname = u.pathname;
    }
  } catch {
    pathname = urlOrRoute;
  }
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  // 2. Route candidate match
  let matchedRoute: RouteDefinition | undefined = undefined;
  for (const r of routes) {
    if (r.path === pathname || (pathname !== '/' && r.path.endsWith(pathname))) {
      matchedRoute = r;
      break;
    }
  }

  // Also check file-based routing conventions (Next.js App / Pages router)
  let routeFile = matchedRoute?.file;
  if (!routeFile) {
    const cleanRoute = pathname === '/' ? 'index' : pathname.replace(/^\/+/, '');
    const routeCandidates = [
      `src/app/${cleanRoute}/page.tsx`,
      `src/app/${cleanRoute}/page.jsx`,
      `app/${cleanRoute}/page.tsx`,
      `app/${cleanRoute}/page.jsx`,
      `src/pages/${cleanRoute}.tsx`,
      `src/pages/${cleanRoute}.jsx`,
      `pages/${cleanRoute}.tsx`,
      `pages/${cleanRoute}.jsx`,
      `src/pages/${cleanRoute}/index.tsx`,
      `pages/${cleanRoute}/index.tsx`
    ];
    for (const c of routeCandidates) {
      if (fileTree.includes(c)) {
        routeFile = c;
        break;
      }
    }
  }

  // 3. Extract tokens from selector
  // e.g. "button.login-btn#auth-action" -> id: "auth-action", classes: ["login-btn"], tag: "button"
  const cleanSelector = selector.trim();
  const idMatch = cleanSelector.match(/#([a-zA-Z0-9_-]+)/);
  const targetId = idMatch ? idMatch[1] : null;

  const classMatches = Array.from(cleanSelector.matchAll(/\.([a-zA-Z0-9_-]+)/g)).map((m) => m[1]);
  const testIdMatch = cleanSelector.match(/\[data-testid=['"]?([a-zA-Z0-9_-]+)['"]?\]/);
  const targetTestId = testIdMatch ? testIdMatch[1] : null;

  // 4. Score component files in repository
  const candidates: SourceCandidate[] = [];
  const relatedFiles = new Set<string>();

  const componentFiles = fileTree.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return ['.tsx', '.jsx', '.vue', '.svelte', '.html'].includes(ext);
  });

  const rootDir = (index as any).rootDir || process.cwd();

  for (const relPath of componentFiles) {
    const fullPath = path.resolve(rootDir, relPath);
    let content = '';
    try {
      content = fs.readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const evidence: string[] = [];
    let score = 0;
    let hitLine: number | undefined = undefined;

    // Check data-testid
    if (targetTestId && content.includes(targetTestId)) {
      score += 0.5;
      evidence.push(`Direct matching data-testid="${targetTestId}"`);
      const l = lines.findIndex((ln) => ln.includes(targetTestId));
      if (l >= 0 && !hitLine) hitLine = l + 1;
    }

    // Check id
    if (targetId && content.includes(targetId)) {
      score += 0.4;
      evidence.push(`Direct matching id="${targetId}"`);
      const l = lines.findIndex((ln) => ln.includes(targetId));
      if (l >= 0 && !hitLine) hitLine = l + 1;
    }

    // Check class names
    for (const cls of classMatches) {
      if (content.includes(cls)) {
        score += 0.25;
        evidence.push(`Matching class/token "${cls}"`);
        const l = lines.findIndex((ln) => ln.includes(cls));
        if (l >= 0 && !hitLine) hitLine = l + 1;
      }
    }

    // Check text snippet
    if (textSnippet && textSnippet.length >= 3 && content.includes(textSnippet)) {
      score += 0.35;
      evidence.push(`Text content occurrence: "${textSnippet}"`);
      const l = lines.findIndex((ln) => ln.includes(textSnippet));
      if (l >= 0 && !hitLine) hitLine = l + 1;
    }

    // Check tag match if selector is specific
    if (tag && content.toLowerCase().includes(`<${tag.toLowerCase()}`)) {
      score += 0.1;
      evidence.push(`Rendered JSX/HTML tag <${tag}>`);
    }

    // Route connection bonus
    if (routeFile && relPath === routeFile) {
      score += 0.3;
      evidence.push(`Entry component for current route (${pathname})`);
    }

    // Check AST symbols exported in this file
    const fileSymbols = index.getAllSymbols().filter((s) => s.filePath === relPath);
    for (const sym of fileSymbols) {
      const symLower = sym.name.toLowerCase();
      if (
        cleanSelector.toLowerCase().includes(symLower) ||
        (targetId && targetId.toLowerCase().includes(symLower)) ||
        classMatches.some((c) => c.toLowerCase() === symLower || c.toLowerCase().includes(symLower)) ||
        (tag && tag.toLowerCase() === symLower)
      ) {
        score += 0.35;
        evidence.push(`Direct AST symbol match: ${sym.name} (${sym.kind})`);
        if (!hitLine) hitLine = sym.startLine;
      }
    }

    // Related styles
    const baseName = path.basename(relPath, path.extname(relPath));
    const potentialCss = [
      path.join(path.dirname(relPath), `${baseName}.css`),
      path.join(path.dirname(relPath), `${baseName}.module.css`),
      path.join(path.dirname(relPath), `${baseName}.scss`),
      path.join(path.dirname(relPath), `${baseName}.module.scss`)
    ];
    for (const css of potentialCss) {
      if (fileTree.includes(css)) {
        relatedFiles.add(css);
      }
    }

    if (score > 0) {
      const confidence = Math.min(0.99, Math.round(score * 100) / 100);
      candidates.push({
        file: relPath,
        symbol: baseName,
        startLine: hitLine ? Math.max(1, hitLine - 2) : 1,
        endLine: hitLine ? hitLine + 15 : undefined,
        confidence,
        evidence
      });
    }
  }

  // Sort candidates by descending confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    selector: cleanSelector,
    tag: tag || undefined,
    textSnippet: textSnippet || undefined,
    matchedRoute: matchedRoute?.path || pathname,
    routeFile,
    sourceCandidates: candidates.slice(0, 5),
    relatedFiles: Array.from(relatedFiles).slice(0, 5)
  };
}

export interface GetContextOptions {
  repoIdentifier?: string;
  urlOrRoute?: string;
  selector?: string;
  textSnippet?: string;
  tag?: string;
  inspectionResult?: WebInspectionResult;
}

export function getContext(options: GetContextOptions): CompactTaskContext {
  const {
    repoIdentifier,
    urlOrRoute = '/',
    selector = '',
    textSnippet = '',
    tag = '',
    inspectionResult
  } = options;

  // 1. Correlate element to source candidates
  const correlation = findUiSource({
    repoIdentifier,
    urlOrRoute,
    selector,
    textSnippet,
    tag
  });

  // 2. Extract bounds & visual issues if inspectionResult is provided
  let bounds: { x: number; y: number; width: number; height: number } | undefined = undefined;
  const issues: string[] = [];

  if (inspectionResult) {
    if (selector) {
      const el = inspectionResult.interactiveElements?.find(
        (e) => e.selector === selector || selector.includes(e.selector) || e.selector.includes(selector)
      );
      if (el?.rect) {
        bounds = el.rect;
      }
    }

    if (inspectionResult.critique) {
      const c = inspectionResult.critique;
      if (Array.isArray(c.contrastIssues)) {
        for (const ci of c.contrastIssues) {
          if (!ci.passesAA && (!selector || ci.selector?.includes(selector) || selector.includes(ci.selector))) {
            issues.push(`Contrast failure on ${ci.selector}: ratio ${ci.contrastRatio}:1 (needed ${ci.requiredRatio}:1)`);
          }
        }
      }
      if (Array.isArray(c.spacingIssues)) {
        for (const si of c.spacingIssues) {
          if (!selector || si.selector?.includes(selector) || selector.includes(si.selector)) {
            issues.push(`Off-grid spacing on ${si.selector} (${si.property}: ${si.value})`);
          }
        }
      }
      if (Array.isArray(c.touchTargetIssues)) {
        for (const ti of c.touchTargetIssues) {
          if (!selector || ti.selector?.includes(selector) || selector.includes(ti.selector)) {
            issues.push(`Touch target too small on ${ti.selector} (${ti.width}x${ti.height}px < 44x44px)`);
          }
        }
      }
    }
  }

  // 3. Compute impact for primary candidate
  const primary = correlation.sourceCandidates[0];
  let impactInfo: {
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    affectedRoutes: string[];
    directDependents: string[];
  } = {
    riskLevel: 'LOW',
    affectedRoutes: correlation.matchedRoute ? [correlation.matchedRoute] : [],
    directDependents: []
  };

  if (primary?.symbol) {
    try {
      const impact = getActiveIndex(repoIdentifier).traceImpact(primary.symbol);
      impactInfo = {
        riskLevel: impact.riskLevel,
        affectedRoutes: impact.affectedRoutes,
        directDependents: impact.directDependents
      };
    } catch {}
  } else if (primary?.file) {
    try {
      const impact = getActiveIndex(repoIdentifier).traceImpact(primary.file);
      impactInfo = {
        riskLevel: impact.riskLevel,
        affectedRoutes: impact.affectedRoutes,
        directDependents: impact.directDependents
      };
    } catch {}
  }

  const targetName = selector || tag || textSnippet || 'target view';
  const summary = `Compact Context for "${targetName}": maps to ${
    primary
      ? `${primary.file} (${primary.symbol}) with ${(primary.confidence * 100).toFixed(0)}% confidence`
      : 'no direct candidate'
  }. Blast radius: ${impactInfo.riskLevel} (${impactInfo.affectedRoutes.length} route(s), ${
    impactInfo.directDependents.length
  } direct dependent(s)).`;

  return {
    taskTarget: {
      selector: correlation.selector,
      tag: correlation.tag,
      bounds,
      issues: issues.length > 0 ? issues : undefined
    },
    sourceCandidates: correlation.sourceCandidates,
    relatedFiles: correlation.relatedFiles,
    impact: impactInfo,
    summary
  };
}
