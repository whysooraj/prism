import type { LayoutNode, NodeRect, WebInspectionResult } from '../types.js';

export interface LayoutShift {
  selector: string;
  beforeRect: NodeRect;
  afterRect: NodeRect;
  deltaX: number;
  deltaY: number;
}

export interface VerificationResult {
  verdict: 'PASSED' | 'REGRESSION' | 'PARTIAL_FIX' | 'INCONCLUSIVE';
  scoreDelta: number;
  beforeScore: number;
  afterScore: number;
  resolvedDefects: string[];
  newRegressions: string[];
  missingElements: string[];
  addedElements: string[];
  layoutShifts: LayoutShift[];
  summary: string;
}

function extractDefects(result: WebInspectionResult): Map<string, string> {
  const map = new Map<string, string>();
  if (!result || !result.critique) return map;

  const c = result.critique;

  // 1. Contrast issues (failing WCAG AA)
  if (Array.isArray(c.contrastIssues)) {
    for (const issue of c.contrastIssues) {
      if (!issue.passesAA) {
        const sel = issue.selector || issue.element || 'unknown';
        const id = `contrast:${sel}`;
        const ratio = typeof issue.contrastRatio === 'number' ? issue.contrastRatio.toFixed(2) : '?';
        const req = typeof issue.requiredRatio === 'number' ? issue.requiredRatio.toFixed(1) : '4.5';
        map.set(id, `Contrast failure on "${sel}": ${ratio}:1 (required ${req}:1)`);
      }
    }
  }

  // 2. Horizontal layout overflow
  if (c.horizontalOverflow) {
    map.set('layout:horizontal-overflow', 'Horizontal layout overflow (scrollWidth > clientWidth)');
  }

  // 3. Text overflow and clipping
  if (Array.isArray(c.textOverflowIssues)) {
    for (const issue of c.textOverflowIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `text-overflow:${sel}`;
      let detail = `Text overflow/clipping on "${sel}"`;
      if (issue.verticalClipping) detail += ' (vertical clipping)';
      else if (issue.collapsedLineHeight) detail += ' (collapsed line-height)';
      if (issue.text) detail += `: "${issue.text.slice(0, 30)}"`;
      map.set(id, detail);
    }
  }

  // 4. Spacing grid deviations
  if (Array.isArray(c.spacingIssues)) {
    for (const issue of c.spacingIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `spacing:${sel}:${issue.property}`;
      map.set(id, `Off-grid spacing on "${sel}" (${issue.property}: ${issue.value})`);
    }
  }

  // 5. Asymmetric button / container padding
  if (Array.isArray(c.asymmetricPaddingIssues)) {
    for (const issue of c.asymmetricPaddingIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `asymmetric-padding:${sel}`;
      map.set(id, `Asymmetric padding on "${sel}" (${issue.left}px L vs ${issue.right}px R)`);
    }
  }

  // 6. Focus outline suppression
  if (Array.isArray(c.focusOutlineIssues)) {
    for (const issue of c.focusOutlineIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `focus-outline:${sel}`;
      map.set(id, `Focus outline suppressed on "${sel}"`);
    }
  }

  // 7. Disabled state affordance
  if (Array.isArray(c.disabledAffordanceIssues)) {
    for (const issue of c.disabledAffordanceIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `disabled-affordance:${sel}`;
      map.set(id, `Disabled affordance failure on "${sel}"`);
    }
  }

  // 8. Mobile touch target size (< 44x44px)
  if (Array.isArray(c.touchTargetIssues)) {
    for (const issue of c.touchTargetIssues) {
      const sel = issue.selector || issue.element || 'unknown';
      const id = `touch-target:${sel}`;
      map.set(id, `Touch target too small on "${sel}" (${issue.width}x${issue.height}px < 44x44px)`);
    }
  }

  // 9. Visual occlusion
  if (Array.isArray(c.occlusionIssues)) {
    for (const issue of c.occlusionIssues) {
      const sel = issue.targetSelector || issue.targetElement || 'unknown';
      const id = `occlusion:${sel}`;
      map.set(id, `Visual occlusion: "${sel}" occluded by "${issue.occludedBySelector || issue.occludedBy}"`);
    }
  }

  // 10. Color palette sprawl
  if (c.paletteSprawl) {
    map.set('palette:sprawl', `Color palette sprawl (${c.totalUniqueColors} unique colors detected, limit <= 18)`);
  }

  // 11. AI design tropes
  if (Array.isArray(c.aiTropesDetected)) {
    for (const trope of c.aiTropesDetected) {
      const id = `ai-trope:${trope.slice(0, 35)}`;
      map.set(id, `AI design trope detected: ${trope}`);
    }
  }

  return map;
}

function extractElementRects(result: WebInspectionResult): Map<string, NodeRect> {
  const map = new Map<string, NodeRect>();
  if (!result) return map;

  function walk(node: LayoutNode, path = '') {
    if (!node) return;
    let selector = '';
    if (node.id) {
      selector = `#${node.id}`;
    } else {
      const classes = node.classes && node.classes.length > 0 ? '.' + node.classes.slice(0, 2).join('.') : '';
      selector = path ? `${path} > ${node.tag}${classes}` : `${node.tag}${classes}`;
    }

    if (node.rect && (node.rect.width > 0 || node.rect.height > 0)) {
      if (!map.has(selector)) {
        map.set(selector, node.rect);
      }
      if (node.componentName && !map.has(`Component:${node.componentName}`)) {
        map.set(`Component:${node.componentName}`, node.rect);
      }
    }

    if (node.children && Array.isArray(node.children)) {
      const tagCounts: Record<string, number> = {};
      for (const child of node.children) {
        tagCounts[child.tag] = (tagCounts[child.tag] || 0) + 1;
      }
      const tagIdx: Record<string, number> = {};
      for (const child of node.children) {
        tagIdx[child.tag] = (tagIdx[child.tag] || 0) + 1;
        const nth = tagCounts[child.tag] > 1 ? `:nth-of-type(${tagIdx[child.tag]})` : '';
        const childClass = child.classes && child.classes.length > 0 ? '.' + child.classes.slice(0, 2).join('.') : '';
        const childPath = child.id ? `#${child.id}` : `${selector} > ${child.tag}${childClass}${nth}`;
        walk(child, childPath);
      }
    }
  }

  if (result.layoutTree) {
    walk(result.layoutTree);
  }

  if (result.interactiveElements && Array.isArray(result.interactiveElements)) {
    for (const el of result.interactiveElements) {
      if (el.selector && el.rect) {
        if (!map.has(el.selector)) {
          map.set(el.selector, el.rect);
        }
        if (el.componentName && !map.has(`Component:${el.componentName}`)) {
          map.set(`Component:${el.componentName}`, el.rect);
        }
      }
    }
  }

  return map;
}

export interface VerifyChangeOptions {
  allowedShiftSelectors?: string[];
  allowedRemovedSelectors?: string[];
  maxAcceptableShiftPx?: number;
}

export function verifyChange(
  before: WebInspectionResult,
  after: WebInspectionResult,
  options?: VerifyChangeOptions
): VerificationResult {
  const beforeScore = before?.critique?.score ?? 0;
  const afterScore = after?.critique?.score ?? 0;
  const scoreDelta = afterScore - beforeScore;
  const thresholdPx = options?.maxAcceptableShiftPx ?? 2;
  const allowedSelectors = options?.allowedShiftSelectors ?? [];
  const allowedRemoved = options?.allowedRemovedSelectors ?? [];

  const beforeRects = extractElementRects(before);
  const afterRects = extractElementRects(after);

  // Check inconclusive state (broken rendering, empty DOM tree, or crashed capture)
  const isBrokenRender = !before?.layoutTree || !after?.layoutTree || (beforeRects.size > 0 && afterRects.size === 0);
  if (isBrokenRender) {
    return {
      verdict: 'INCONCLUSIVE',
      scoreDelta: 0,
      beforeScore,
      afterScore,
      resolvedDefects: [],
      newRegressions: ['Verification inconclusive: target page failed to render or produced empty layout tree'],
      missingElements: [],
      addedElements: [],
      layoutShifts: [],
      summary: 'Verification INCONCLUSIVE: target page failed to render or produced empty layout tree.'
    };
  }

  const beforeDefects = extractDefects(before);
  const afterDefects = extractDefects(after);

  const resolvedDefects: string[] = [];
  for (const [id, desc] of beforeDefects.entries()) {
    if (!afterDefects.has(id)) {
      resolvedDefects.push(desc);
    }
  }

  const newRegressions: string[] = [];
  for (const [id, desc] of afterDefects.entries()) {
    if (!beforeDefects.has(id)) {
      newRegressions.push(desc);
    }
  }

  const layoutShifts: LayoutShift[] = [];
  const unexpectedShifts: LayoutShift[] = [];
  const missingElements: string[] = [];
  const addedElements: string[] = [];

  for (const [selector, bRect] of beforeRects.entries()) {
    const aRect = afterRects.get(selector);
    if (!aRect) {
      // Element missing in after state!
      const isAllowedRemoval = [...allowedSelectors, ...allowedRemoved].some(
        (pattern) => selector === pattern || selector.includes(pattern) || pattern.includes(selector)
      );
      if (!isAllowedRemoval) {
        missingElements.push(selector);
      }
      continue;
    }

    const deltaX = aRect.x - bRect.x;
    const deltaY = aRect.y - bRect.y;
    const deltaW = aRect.width - bRect.width;
    const deltaH = aRect.height - bRect.height;

    // Detect bounding box shifts of threshold or more
    if (
      Math.abs(deltaX) >= thresholdPx ||
      Math.abs(deltaY) >= thresholdPx ||
      Math.abs(deltaW) >= thresholdPx ||
      Math.abs(deltaH) >= thresholdPx
    ) {
      const shift: LayoutShift = {
        selector,
        beforeRect: bRect,
        afterRect: aRect,
        deltaX,
        deltaY
      };
      layoutShifts.push(shift);

      // Check if shift is permitted by allowedShiftSelectors
      const isAllowed = allowedSelectors.some(
        (pattern) => selector === pattern || selector.includes(pattern) || pattern.includes(selector)
      );
      if (!isAllowed) {
        unexpectedShifts.push(shift);
      }
    }
  }

  for (const selector of afterRects.keys()) {
    if (!beforeRects.has(selector)) {
      addedElements.push(selector);
    }
  }

  let verdict: 'PASSED' | 'REGRESSION' | 'PARTIAL_FIX' | 'INCONCLUSIVE';
  if (missingElements.length > 0 || newRegressions.length > 0 || unexpectedShifts.length > 0 || scoreDelta < 0) {
    verdict = 'REGRESSION';
  } else if (afterDefects.size > 0) {
    verdict = 'PARTIAL_FIX';
  } else {
    verdict = 'PASSED';
  }

  const parts: string[] = [];
  parts.push(`Verification ${verdict}: score ${beforeScore} -> ${afterScore} (${scoreDelta >= 0 ? '+' : ''}${scoreDelta}).`);
  if (resolvedDefects.length > 0) {
    parts.push(`${resolvedDefects.length} defect(s) resolved.`);
  }
  if (newRegressions.length > 0) {
    parts.push(`${newRegressions.length} new regression(s) detected.`);
  }
  if (missingElements.length > 0) {
    parts.push(`${missingElements.length} unexpected missing element(s) disappeared.`);
  }
  if (layoutShifts.length > 0) {
    parts.push(`${layoutShifts.length} unexpected layout shift(s) (>=2px).`);
  }
  if (resolvedDefects.length === 0 && newRegressions.length === 0 && layoutShifts.length === 0 && missingElements.length === 0) {
    parts.push('No visual or defect changes detected.');
  }

  return {
    verdict,
    scoreDelta,
    beforeScore,
    afterScore,
    resolvedDefects,
    newRegressions,
    missingElements,
    addedElements,
    layoutShifts,
    summary: parts.join(' ')
  };
}
