import type { Page } from 'playwright-core';
import { createSafeContext } from './browser.js';
import { generateWireframeSvg } from './layout.js';
import { generateAsciiRadar } from './ascii-radar.js';
import { auditDesign, calculateContrastRatio, parseRgb } from './design-audit.js';
import type {
  ContrastIssue,
  DesignPalette,
  InteractiveElement,
  LayoutNode,
  SpacingIssue,
  TouchTargetIssue,
  TypographyScale,
  WebInspectionResult
} from '../types.js';

export interface InspectOptions {
  url: string;
  viewport?: { width: number; height: number };
  allowLocalhost?: boolean;
  includeWireframeSvg?: boolean;
  includeA11y?: boolean;
}

export async function waitForBrowserStabilization(page: Page, maxWaitMs = 1200): Promise<void> {
  const stabilizePromise = page
    .evaluate((maxWait) => {
      var __name = (globalThis as any).__name || ((fn: any) => fn);
      return new Promise<void>((resolve) => {
        let finished = false;
        const hardTimer = setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve();
          }
        }, maxWait);

        function done() {
          if (!finished) {
            finished = true;
            clearTimeout(hardTimer);
            resolve();
          }
        }

        const fontPromise =
          document.fonts && typeof (document.fonts as any).ready?.then === 'function'
            ? Promise.race([
                (document.fonts as any).ready.catch(() => {}),
                new Promise((res) => setTimeout(res, 250))
              ])
            : Promise.resolve();

        fontPromise.then(() => {
          if (finished) return;

          const QUIET_PERIOD_MS = 100;
          const start = performance.now();
          let lastShift = performance.now();

          let observer: MutationObserver | null = null;
          try {
            observer = new MutationObserver(() => {
              lastShift = performance.now();
            });
            if (document.body) {
              observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                characterData: true
              });
            }
          } catch {}

          function sampleRects(): number[] {
            const rects: number[] = [];
            const elements = document.querySelectorAll(
              'body, header, nav, main, footer, section, article, h1, h2, button, a, input, [id]'
            );
            const len = Math.min(elements.length, 30);
            for (let i = 0; i < len; i++) {
              const r = elements[i].getBoundingClientRect();
              rects.push(Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height));
            }
            return rects;
          }

          let prev = sampleRects();

          const interval = setInterval(() => {
            if (finished) {
              clearInterval(interval);
              if (observer) observer.disconnect();
              return;
            }
            const now = performance.now();
            const cur = sampleRects();
            let shifted = cur.length !== prev.length;
            if (!shifted) {
              for (let i = 0; i < cur.length; i++) {
                if (Math.abs(cur[i] - prev[i]) >= 1) {
                  shifted = true;
                  break;
                }
              }
            }
            prev = cur;
            if (shifted) {
              lastShift = now;
            }

            if (now - lastShift >= QUIET_PERIOD_MS || now - start >= maxWait) {
              clearInterval(interval);
              if (observer) observer.disconnect();
              done();
            }
          }, 30);
        });
      });
    }, maxWaitMs)
    .catch(() => {});

  // Hard timeout on Node side so Playwright page.evaluate can never stall
  await Promise.race([
    stabilizePromise,
    new Promise((resolve) => setTimeout(resolve, maxWaitMs + 200))
  ]);
}

export async function inspectWebsite(options: InspectOptions): Promise<WebInspectionResult> {
  const {
    url,
    viewport = { width: 1440, height: 900 },
    allowLocalhost = false,
    includeWireframeSvg = true,
    includeA11y = false
  } = options;

  const context = await createSafeContext(viewport, allowLocalhost);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Browser readiness stabilization: webfonts ready + settle layout shifts (no shifts for 150ms, max 1500ms fallback)
    await waitForBrowserStabilization(page);

    const title = await page.title();

    // In-browser inspection script
    const inspectionData = await page.evaluate(() => {
      var __name = (globalThis as any).__name || ((fn: any) => fn);
      function getSelector(el: Element): string {
        if (el.id) return `#${el.id}`;
        const className = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
        return `${el.tagName.toLowerCase()}${className}`;
      }

      function parsePx(val: string): number {
        const num = parseFloat(val);
        return isNaN(num) ? 0 : Math.round(num);
      }

      const backgroundsMap: Record<string, number> = {};
      const textColorsMap: Record<string, number> = {};
      const typographyMap: Record<string, { family: string; size: string; weight: string; lineHeight: string; count: number }> = {};
      const interactiveList: { tag: string; type?: string; selector: string; text: string; rect: any; disabled?: boolean }[] = [];
      const contrastCandidateList: { element: string; selector: string; fg: string; bg: string; text: string; fontSize: number }[] = [];
      const spacingCandidateList: { element: string; selector: string; property: string; value: string; num: number }[] = [];
      const touchTargetCandidateList: { element: string; selector: string; width: number; height: number }[] = [];
      const occlusionCandidateList: { targetElement: string; targetSelector: string; occludedBy: string; occludedBySelector: string; point: { x: number; y: number } }[] = [];
      const asymmetricPaddingCandidateList: { element: string; selector: string; left: number; right: number; top: number; bottom: number; reason: string }[] = [];
      const textOverflowCandidateList: { element: string; selector: string; text: string; scrollWidth: number; clientWidth: number; scrollHeight?: number; clientHeight?: number; verticalClipping?: boolean; collapsedLineHeight?: boolean }[] = [];
      const focusOutlineCandidateList: { element: string; selector: string; reason: string }[] = [];
      const disabledAffordanceCandidateList: { element: string; selector: string; reason: string }[] = [];
      const buttonAffordanceList: { element: string; selector: string; disabled: boolean; bg: string; color: string; opacity: number }[] = [];
      const aiTropes: string[] = [];

      function parseRgba(str: string): [number, number, number, number] | null {
        const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), m[4] !== undefined ? parseFloat(m[4]) : 1.0];
      }

      function compositeColors(top: [number, number, number, number], bot: [number, number, number, number]): [number, number, number, number] {
        const a1 = top[3];
        const a2 = bot[3];
        const outA = a1 + a2 * (1 - a1);
        if (outA <= 0) return [255, 255, 255, 1];
        const outR = Math.round((top[0] * a1 + bot[0] * a2 * (1 - a1)) / outA);
        const outG = Math.round((top[1] * a1 + bot[1] * a2 * (1 - a1)) / outA);
        const outB = Math.round((top[2] * a1 + bot[2] * a2 * (1 - a1)) / outA);
        return [outR, outG, outB, Math.min(1, outA)];
      }

      function getEffectiveBg(curr: Element | null): string {
        const layers: [number, number, number, number][] = [];
        let el = curr;
        while (el && el !== document.documentElement) {
          const pStyle = window.getComputedStyle(el);
          const pBg = pStyle.backgroundColor;
          if (pBg && pBg !== 'rgba(0, 0, 0, 0)' && pBg !== 'transparent') {
            const parsed = parseRgba(pBg);
            if (parsed) {
              layers.push(parsed);
              if (parsed[3] >= 0.99) break;
            }
          }
          el = el.parentElement;
        }

        const rootStyle = window.getComputedStyle(document.documentElement);
        const rootBg = rootStyle.backgroundColor;
        let baseColor: [number, number, number, number] = [255, 255, 255, 1];
        if (rootBg && rootBg !== 'rgba(0, 0, 0, 0)' && rootBg !== 'transparent') {
          const parsedRoot = parseRgba(rootBg);
          if (parsedRoot) baseColor = parsedRoot;
        }

        let currentComp = baseColor;
        for (let i = layers.length - 1; i >= 0; i--) {
          currentComp = compositeColors(layers[i], currentComp);
        }
        return `rgb(${currentComp[0]}, ${currentComp[1]}, ${currentComp[2]})`;
      }

      function getGradientStops(curr: Element | null): string[] {
        let el = curr;
        while (el && el !== document.documentElement) {
          const pStyle = window.getComputedStyle(el);
          const bgImg = pStyle.backgroundImage;
          if (bgImg && bgImg.includes('gradient')) {
            const colorRegex = /(?:rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*[\d.]+\s*)?\)|#[0-9a-fA-F]{3,8})/g;
            const matches: string[] = [];
            let m;
            while ((m = colorRegex.exec(bgImg)) !== null) {
              matches.push(m[0]);
            }
            if (matches.length > 0) return matches;
          }
          el = el.parentElement;
        }
        return [];
      }

      // Check horizontal overflow
      const horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;

      // Check for generic AI gradient accents or glassmorphism
      const allElements = Array.from(document.querySelectorAll('*'));
      let purpleGradientsFound = 0;
      let glassmorphismFound = 0;
      let cardSoupCount = 0;

      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // Detect generic purple-to-indigo or cyan gradients
        const bgImg = style.backgroundImage;
        if (
          bgImg.includes('gradient') &&
          (bgImg.includes('147, 51, 234') || bgImg.includes('79, 70, 229') || bgImg.includes('168, 85, 247') || bgImg.includes('124, 58, 237'))
        ) {
          purpleGradientsFound++;
        }

        // Detect excessive glassmorphism
        const backdrop = (style as any).backdropFilter || (style as any).webkitBackdropFilter;
        if (backdrop && backdrop.includes('blur')) {
          glassmorphismFound++;
        }

        // Detect repetitive card soup
        if (style.borderRadius && parseFloat(style.borderRadius) >= 12 && style.boxShadow && style.boxShadow !== 'none') {
          cardSoupCount++;
        }
      }

      if (purpleGradientsFound > 0) {
        aiTropes.push(`Generic AI purple/indigo gradients found (${purpleGradientsFound} elements)`);
      }
      if (glassmorphismFound > 2) {
        aiTropes.push(`Ungrounded glassmorphism blur found (${glassmorphismFound} elements)`);
      }
      if (cardSoupCount > 8) {
        aiTropes.push(`Card soup pattern: high density of isolated rounded shadowed cards (${cardSoupCount})`);
      }

      // Extract DOM Layout Tree recursively
      function extractNode(el: Element, depth: number): any | null {
        if (depth > 6) return null;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'PATH', 'HEAD'].includes(el.tagName)) return null;

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
          return null;
        }

        const rect = el.getBoundingClientRect();
        // Ignore zero-size elements
        if (rect.width === 0 && rect.height === 0) return null;

        const tag = el.tagName.toLowerCase();
        const selector = getSelector(el);

        // Record colors
        const bg = style.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          backgroundsMap[bg] = (backgroundsMap[bg] || 0) + 1;
        }

        const color = style.color;
        if (color) {
          textColorsMap[color] = (textColorsMap[color] || 0) + 1;
        }

        // Typography token
        const fontKey = `${style.fontFamily}__${style.fontSize}__${style.fontWeight}`;
        if (!typographyMap[fontKey]) {
          typographyMap[fontKey] = {
            family: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim(),
            size: style.fontSize,
            weight: style.fontWeight,
            lineHeight: style.lineHeight,
            count: 1
          };
        } else {
          typographyMap[fontKey].count++;
        }

        // Spacing checks (padding, margin)
        const padTop = parsePx(style.paddingTop);
        const padRight = parsePx(style.paddingRight);
        const padBottom = parsePx(style.paddingBottom);
        const padLeft = parsePx(style.paddingLeft);

        const marginTop = parsePx(style.marginTop);
        const marginRight = parsePx(style.marginRight);
        const marginBottom = parsePx(style.marginBottom);
        const marginLeft = parsePx(style.marginLeft);

        const borderTop = parsePx(style.borderTopWidth);
        const borderRight = parsePx(style.borderRightWidth);
        const borderBottom = parsePx(style.borderBottomWidth);
        const borderLeft = parsePx(style.borderLeftWidth);

        // Track non-standard spacing on meaningful elements
        if (rect.width > 20 && (padTop % 4 !== 0 && padTop > 2)) {
          spacingCandidateList.push({ element: tag, selector, property: 'padding-top', value: `${padTop}px`, num: padTop });
        }
        if (rect.width > 20 && (padLeft % 4 !== 0 && padLeft > 2)) {
          spacingCandidateList.push({ element: tag, selector, property: 'padding-left', value: `${padLeft}px`, num: padLeft });
        }

        // Interactive element collection
        const isInteractive = ['button', 'a', 'input', 'select', 'textarea'].includes(tag) || (el as HTMLElement).onclick != null || el.getAttribute('role') === 'button';
        if (isInteractive && rect.width > 0 && rect.height > 0) {
          const text = (el.textContent || '').trim().slice(0, 50);
          interactiveList.push({
            tag,
            type: (el as HTMLInputElement).type,
            selector,
            text,
            rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
            disabled: (el as HTMLButtonElement).disabled
          });

          // Check mobile touch target size
          if (rect.width < 44 || rect.height < 44) {
            touchTargetCandidateList.push({
              element: tag,
              selector,
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            });
          }

          // Check asymmetric horizontal padding (optical balance defect)
          if (rect.width > 30 && Math.abs(padLeft - padRight) >= 4) {
            asymmetricPaddingCandidateList.push({
              element: tag,
              selector,
              left: padLeft,
              right: padRight,
              top: padTop,
              bottom: padBottom,
              reason: `Asymmetric padding (${padLeft}px left vs ${padRight}px right) disrupts optical button balance`
            });
          }

          // Check focus outline suppression
          const outline = style.outline;
          const outlineStyle = style.outlineStyle;
          const outlineWidth = parsePx(style.outlineWidth);
          const boxShadow = style.boxShadow;
          if ((outline === 'none' || outlineStyle === 'none' || outlineWidth === 0 || (el as HTMLElement).style.outline === 'none') && (!boxShadow || boxShadow === 'none')) {
            focusOutlineCandidateList.push({
              element: tag,
              selector,
              reason: `${selector} suppresses focus outline (${outline || 'none'}) without an alternative visible indicator`
            });
          }

          // Record button affordance
          if (['button', 'input'].includes(tag) || el.getAttribute('role') === 'button') {
            const isDis = !!(el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled');
            buttonAffordanceList.push({
              element: tag,
              selector,
              disabled: isDis,
              bg: style.backgroundColor,
              color: style.color,
              opacity: parseFloat(style.opacity) || 1.0
            });
          }
        }

        // Direct text extraction
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0)
          .map((n) => n.textContent?.trim())
          .join(' ');

        // Check visual occlusion / overlapping layers blocking elements (interactive + landmark text)
        const isLandmarkOrText = ['h1', 'h2', 'h3', 'h4', 'main'].includes(tag) || (directText.length > 0 && rect.y < 120);
        if ((isInteractive || isLandmarkOrText) && rect.width > 0 && rect.height > 0) {
          const cx = Math.round(rect.x + Math.min(24, rect.width / 2));
          const cy = Math.round(rect.y + Math.min(24, rect.height / 2));
          if (cx >= 0 && cx < window.innerWidth && cy >= 0 && cy < window.innerHeight) {
            const topEl = document.elementFromPoint(cx, cy);
            if (topEl && topEl !== el && !el.contains(topEl) && !topEl.contains(el)) {
              const topStyle = window.getComputedStyle(topEl);
              if (topStyle.pointerEvents !== 'none' && topStyle.display !== 'none' && parseFloat(topStyle.opacity) > 0) {
                occlusionCandidateList.push({
                  targetElement: tag,
                  targetSelector: selector,
                  occludedBy: topEl.tagName.toLowerCase(),
                  occludedBySelector: getSelector(topEl),
                  point: { x: cx, y: cy }
                });
              }
            }
          }
        }

        // Text contrast candidates (using effective resolved background)

        // Check text overflow, vertical clipping, and collapsed line-height
        if (directText.length > 0 && rect.width > 0 && rect.height > 0) {
          const scrollW = (el as HTMLElement).scrollWidth;
          const clientW = (el as HTMLElement).clientWidth;
          const scrollH = (el as HTMLElement).scrollHeight;
          const clientH = (el as HTMLElement).clientHeight;
          const overflowX = style.overflowX;
          const overflowY = style.overflowY;

          const fSize = parseFloat(style.fontSize) || 16;
          const lHeight = parseFloat(style.lineHeight) || fSize;

          if (scrollW > clientW + 2 && (overflowX === 'hidden' || overflowX === 'clip')) {
            textOverflowCandidateList.push({
              element: tag,
              selector,
              text: directText.slice(0, 40),
              scrollWidth: scrollW,
              clientWidth: clientW,
              scrollHeight: scrollH,
              clientHeight: clientH
            });
          }

          // Collapsed line-height (descender clipping)
          if (fSize >= 14 && lHeight > 0 && lHeight < fSize * 0.85) {
            textOverflowCandidateList.push({
              element: tag,
              selector,
              text: directText.slice(0, 40),
              scrollWidth: scrollW,
              clientWidth: clientW,
              scrollHeight: scrollH,
              clientHeight: clientH,
              collapsedLineHeight: true
            });
          }

          // Vertical clipping
          if (scrollH > clientH + 2 && (overflowY === 'hidden' || overflowY === 'clip')) {
            textOverflowCandidateList.push({
              element: tag,
              selector,
              text: directText.slice(0, 40),
              scrollWidth: scrollW,
              clientWidth: clientW,
              scrollHeight: scrollH,
              clientHeight: clientH,
              verticalClipping: true
            });
          }
        }

        const effectiveBg = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && (!bg.includes('rgba') || parseRgba(bg)?.[3] === 1))
          ? bg
          : getEffectiveBg(el);

        if (directText.length > 0 && color) {
          if (effectiveBg) {
            contrastCandidateList.push({
              element: tag,
              selector,
              fg: color,
              bg: effectiveBg,
              text: directText.slice(0, 30),
              fontSize: parseFloat(style.fontSize) || 16
            });
          }

          // Check gradient backdrop stops if any
          const gradStops = getGradientStops(el);
          for (const stop of gradStops) {
            contrastCandidateList.push({
              element: tag,
              selector,
              fg: color,
              bg: stop,
              text: `${directText.slice(0, 20)} (gradient stop)`,
              fontSize: parseFloat(style.fontSize) || 16
            });
          }
        }

        // Recursively extract children
        const children: any[] = [];
        for (let i = 0; i < el.children.length; i++) {
          const childNode = extractNode(el.children[i], depth + 1);
          if (childNode) {
            children.push(childNode);
          }
        }

        return {
          tag,
          id: el.id || undefined,
          classes: Array.from(el.classList),
          role: el.getAttribute('role') || undefined,
          textSnippet: directText.length > 0 ? directText.slice(0, 40) : undefined,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          boxModel: {
            margin: [marginTop, marginRight, marginBottom, marginLeft],
            border: [borderTop, borderRight, borderBottom, borderLeft],
            padding: [padTop, padRight, padBottom, padLeft],
            width: Math.round(rect.width),
            height: Math.round(rect.height)
          },
          styles: {
            display: style.display,
            position: style.position,
            color: style.color,
            backgroundColor: style.backgroundColor,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            lineHeight: style.lineHeight,
            borderRadius: style.borderRadius !== '0px' ? style.borderRadius : undefined,
            gap: style.gap !== 'normal' ? style.gap : undefined
          },
          children
        };
      }

      const layoutRoot = extractNode(document.body, 0) || {
        tag: 'body',
        classes: [],
        rect: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
        boxModel: { margin: [0, 0, 0, 0], border: [0, 0, 0, 0], padding: [0, 0, 0, 0], width: window.innerWidth, height: window.innerHeight },
        styles: { display: 'block', position: 'static', color: '#000', backgroundColor: '#fff', fontSize: '16px', fontWeight: '400', lineHeight: '24px' },
        children: []
      };

      // Cross-element disabled affordance comparison
      const disabledButtons = buttonAffordanceList.filter((b) => b.disabled);
      const activeButtons = buttonAffordanceList.filter((b) => !b.disabled);
      for (const dis of disabledButtons) {
        const matchActive = activeButtons.find((act) => act.bg === dis.bg && act.color === dis.color && Math.abs(act.opacity - dis.opacity) < 0.05);
        if (matchActive) {
          disabledAffordanceCandidateList.push({
            element: dis.element,
            selector: dis.selector,
            reason: `Disabled element ${dis.selector} has identical background (${dis.bg}) and opacity (${dis.opacity}) to active element ${matchActive.selector}`
          });
        }
      }

      return {
        backgroundsMap,
        textColorsMap,
        typographyMap,
        interactiveList,
        contrastCandidateList,
        spacingCandidateList,
        touchTargetCandidateList,
        occlusionCandidateList,
        asymmetricPaddingCandidateList,
        textOverflowCandidateList,
        focusOutlineCandidateList,
        disabledAffordanceCandidateList,
        horizontalOverflow,
        aiTropes,
        layoutRoot
      };
    });

    // Compute contrast ratios on host
    const contrastIssues: ContrastIssue[] = [];
    for (const c of inspectionData.contrastCandidateList) {
      const fgRgb = parseRgb(c.fg);
      const bgRgb = parseRgb(c.bg);
      if (fgRgb && bgRgb) {
        const ratio = calculateContrastRatio(fgRgb, bgRgb);
        const requiredRatio = c.fontSize >= 18 ? 3.0 : 4.5;
        const passesAA = ratio >= requiredRatio;
        if (!passesAA) {
          contrastIssues.push({
            element: c.element,
            selector: c.selector,
            fg: c.fg,
            bg: c.bg,
            contrastRatio: Math.round(ratio * 10) / 10,
            requiredRatio,
            passesAA
          });
        }
      }
    }

    // Format Palette
    const backgrounds = Object.entries(inspectionData.backgroundsMap)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);

    const textColors = Object.entries(inspectionData.textColorsMap)
      .map(([color, count]) => ({ color, count }))
      .sort((a, b) => b.count - a.count);

    const allColors = new Set([...Object.keys(inspectionData.backgroundsMap), ...Object.keys(inspectionData.textColorsMap)]);
    const palette: DesignPalette = {
      backgrounds: backgrounds.slice(0, 10),
      textColors: textColors.slice(0, 10),
      accents: backgrounds.filter((b) => b.count <= 5).slice(0, 5),
      totalUniqueColors: allColors.size
    };

    // Format Typography
    const typographyTokens = Object.values(inspectionData.typographyMap).sort((a, b) => b.count - a.count);
    const fontFamilies = Array.from(new Set(typographyTokens.map((t) => t.family)));
    const typography: TypographyScale = {
      fontFamilies,
      tokens: typographyTokens.slice(0, 12)
    };

    // Format Spacing Issues
    const spacingIssues: SpacingIssue[] = inspectionData.spacingCandidateList.map((s) => ({
      element: s.element,
      selector: s.selector,
      property: s.property,
      value: s.value,
      offGridReason: `${s.value} is not a multiple of 4px standard grid step`
    }));

    // Touch Target Issues
    const touchTargetIssues: TouchTargetIssue[] = inspectionData.touchTargetCandidateList;

    // Run Design Audit
    const critique = auditDesign({
      palette,
      typography,
      contrastChecks: contrastIssues,
      spacingChecks: spacingIssues,
      touchTargets: touchTargetIssues,
      occlusionChecks: inspectionData.occlusionCandidateList,
      asymmetricPaddingChecks: inspectionData.asymmetricPaddingCandidateList,
      textOverflowChecks: inspectionData.textOverflowCandidateList,
      focusOutlineChecks: inspectionData.focusOutlineCandidateList,
      disabledAffordanceChecks: inspectionData.disabledAffordanceCandidateList,
      horizontalOverflow: inspectionData.horizontalOverflow,
      aiTropes: inspectionData.aiTropes
    });

    // Wireframe SVG
    const wireframeSvg = includeWireframeSvg
      ? generateWireframeSvg(inspectionData.layoutRoot, viewport)
      : undefined;

    // 2D Spatial ASCII Radar
    const asciiRadar = generateAsciiRadar(inspectionData.layoutRoot, viewport);

    // Optional A11y Tree
    let accessibilityTree: any = undefined;
    if (includeA11y) {
      try {
        if (typeof (page as any).locator(':root').ariaSnapshot === 'function') {
          accessibilityTree = await (page as any).locator(':root').ariaSnapshot();
        } else if ((page as any).accessibility?.snapshot) {
          accessibilityTree = await (page as any).accessibility.snapshot();
        }
      } catch {
        // Fallback gracefully if not available
      }
    }

    return {
      url,
      title,
      viewport,
      palette,
      typography,
      critique,
      layoutTree: inspectionData.layoutRoot,
      interactiveElements: inspectionData.interactiveList.slice(0, 40),
      asciiRadar,
      wireframeSvg,
      accessibilityTree
    };
  } finally {
    await page.close();
    await context.close();
  }
}

export async function captureScreenshots(options: {
  url: string;
  allowLocalhost?: boolean;
}): Promise<{ desktopBase64: string; mobileBase64: string }> {
  const { url, allowLocalhost = false } = options;

  // 1. Desktop
  const desktopContext = await createSafeContext({ width: 1440, height: 900 }, allowLocalhost);
  const desktopPage = await desktopContext.newPage();
  await desktopPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForBrowserStabilization(desktopPage);
  const desktopBuffer = await desktopPage.screenshot({ type: 'png', fullPage: false });
  await desktopPage.close();
  await desktopContext.close();

  // 2. Mobile (iPhone 14 / standard 390x844)
  const mobileContext = await createSafeContext({ width: 390, height: 844 }, allowLocalhost);
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForBrowserStabilization(mobilePage);
  const mobileBuffer = await mobilePage.screenshot({ type: 'png', fullPage: false });
  await mobilePage.close();
  await mobileContext.close();

  return {
    desktopBase64: desktopBuffer.toString('base64'),
    mobileBase64: mobileBuffer.toString('base64')
  };
}
