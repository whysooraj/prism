import type { Page } from 'playwright-core';
import { createSafeContext } from './browser.js';
import { generateWireframeSvg } from './layout.js';
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
    // Brief wait for layout stabilization / webfonts
    await page.waitForTimeout(1000);

    const title = await page.title();

    // In-browser inspection script
    const inspectionData = await page.evaluate(() => {
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
      const aiTropes: string[] = [];

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
        }

        // Text contrast candidates
        const directText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE && (n.textContent || '').trim().length > 0)
          .map((n) => n.textContent?.trim())
          .join(' ');

        if (directText.length > 0 && color && bg && bg !== 'rgba(0, 0, 0, 0)') {
          contrastCandidateList.push({
            element: tag,
            selector,
            fg: color,
            bg,
            text: directText.slice(0, 30),
            fontSize: parseFloat(style.fontSize) || 16
          });
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

      return {
        backgroundsMap,
        textColorsMap,
        typographyMap,
        interactiveList,
        contrastCandidateList,
        spacingCandidateList,
        touchTargetCandidateList,
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
      horizontalOverflow: inspectionData.horizontalOverflow,
      aiTropes: inspectionData.aiTropes
    });

    // Wireframe SVG
    const wireframeSvg = includeWireframeSvg
      ? generateWireframeSvg(inspectionData.layoutRoot, viewport)
      : undefined;

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
  await desktopPage.waitForTimeout(500);
  const desktopBuffer = await desktopPage.screenshot({ type: 'png', fullPage: false });
  await desktopPage.close();
  await desktopContext.close();

  // 2. Mobile (iPhone 14 / standard 390x844)
  const mobileContext = await createSafeContext({ width: 390, height: 844 }, allowLocalhost);
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await mobilePage.waitForTimeout(500);
  const mobileBuffer = await mobilePage.screenshot({ type: 'png', fullPage: false });
  await mobilePage.close();
  await mobileContext.close();

  return {
    desktopBase64: desktopBuffer.toString('base64'),
    mobileBase64: mobileBuffer.toString('base64')
  };
}
