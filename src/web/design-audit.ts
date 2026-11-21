import type {
  AsymmetricPaddingIssue,
  ContrastIssue,
  DesignCritique,
  DesignPalette,
  DisabledAffordanceIssue,
  FocusOutlineIssue,
  OcclusionIssue,
  SpacingIssue,
  TextOverflowIssue,
  TouchTargetIssue,
  TypographyScale
} from '../types.js';

export function parseRgb(colorStr: string): [number, number, number, number] | null {
  if (!colorStr || colorStr === 'transparent' || colorStr === 'inherit') {
    return null;
  }

  // Handle rgb(r, g, b) and rgba(r, g, b, a)
  const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    return [
      parseInt(rgbaMatch[1], 10),
      parseInt(rgbaMatch[2], 10),
      parseInt(rgbaMatch[3], 10),
      rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1.0
    ];
  }

  // Handle hex #fff or #ffffff
  if (colorStr.startsWith('#')) {
    let hex = colorStr.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length === 6) {
      const num = parseInt(hex, 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 1.0];
    }
  }

  return null;
}

export function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

export function calculateContrastRatio(fgRgb: [number, number, number, number], bgRgb: [number, number, number, number]): number {
  const l1 = getLuminance(fgRgb[0], fgRgb[1], fgRgb[2]);
  const l2 = getLuminance(bgRgb[0], bgRgb[1], bgRgb[2]);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function isStandardGridMultiple(pixelVal: number): boolean {
  if (pixelVal === 0 || pixelVal === 1 || pixelVal === 2) return true; // Micro borders
  return pixelVal % 4 === 0;
}

export function auditDesign(params: {
  palette: DesignPalette;
  typography: TypographyScale;
  contrastChecks: ContrastIssue[];
  spacingChecks: SpacingIssue[];
  touchTargets: TouchTargetIssue[];
  occlusionChecks: OcclusionIssue[];
  asymmetricPaddingChecks?: AsymmetricPaddingIssue[];
  textOverflowChecks?: TextOverflowIssue[];
  focusOutlineChecks?: FocusOutlineIssue[];
  disabledAffordanceChecks?: DisabledAffordanceIssue[];
  horizontalOverflow: boolean;
  aiTropes: string[];
}): DesignCritique {
  const {
    palette,
    contrastChecks,
    spacingChecks,
    touchTargets,
    occlusionChecks,
    asymmetricPaddingChecks = [],
    textOverflowChecks = [],
    focusOutlineChecks = [],
    disabledAffordanceChecks = [],
    horizontalOverflow,
    aiTropes
  } = params;

  let score = 100;
  const summary: string[] = [];

  // 1. Contrast deductions
  const failingContrast = contrastChecks.filter((c) => !c.passesAA);
  if (failingContrast.length > 0) {
    const penalty = Math.min(25, failingContrast.length * 5);
    score -= penalty;
    summary.push(`Found ${failingContrast.length} text elements failing WCAG AA 4.5:1 contrast (-${penalty} pts)`);
  }

  // 2. Horizontal overflow bug (critical)
  if (horizontalOverflow) {
    score -= 20;
    summary.push('Critical horizontal layout overflow detected: scrollWidth > clientWidth (-20 pts)');
  }

  // 2.5 Text overflow & clipping defects
  if (textOverflowChecks.length > 0) {
    const penalty = Math.min(15, textOverflowChecks.length * 5);
    score -= penalty;
    summary.push(`Found ${textOverflowChecks.length} text elements clipped or overflowing their container bounds (-${penalty} pts)`);
  }

  // 3. Spacing grid consistency
  if (spacingChecks.length > 0) {
    const penalty = Math.min(15, spacingChecks.length * 3);
    score -= penalty;
    summary.push(`Found ${spacingChecks.length} non-standard spacing values deviating from 4/8pt grid (-${penalty} pts)`);
  }

  // 3.5 Asymmetric button / container padding
  if (asymmetricPaddingChecks.length > 0) {
    const penalty = Math.min(10, asymmetricPaddingChecks.length * 2);
    score -= penalty;
    summary.push(`Found ${asymmetricPaddingChecks.length} interactive elements with asymmetric padding causing optical imbalance (-${penalty} pts)`);
  }

  // 3.7 Focus outline suppression (A11y defect)
  if (focusOutlineChecks.length > 0) {
    const penalty = Math.min(15, focusOutlineChecks.length * 5);
    score -= penalty;
    summary.push(`Found ${focusOutlineChecks.length} interactive elements suppressing focus outline without replacement (-${penalty} pts)`);
  }

  // 3.8 Disabled state affordance failure
  if (disabledAffordanceChecks.length > 0) {
    const penalty = Math.min(15, disabledAffordanceChecks.length * 5);
    score -= penalty;
    summary.push(`Found ${disabledAffordanceChecks.length} disabled elements visually indistinguishable from active state (-${penalty} pts)`);
  }

  // 4. Touch targets
  if (touchTargets.length > 0) {
    const penalty = Math.min(15, touchTargets.length * 3);
    score -= penalty;
    summary.push(`Found ${touchTargets.length} interactive elements below mobile 44x44px target standard (-${penalty} pts)`);
  }

  // 4.5. Occlusion / Stacking Context bugs (critical UX defect)
  if (occlusionChecks.length > 0) {
    const penalty = Math.min(25, occlusionChecks.length * 10);
    score -= penalty;
    summary.push(`Critical visual occlusion detected: ${occlusionChecks.length} interactive elements blocked by overlapping layers (-${penalty} pts)`);
  }

  // 5. Palette sprawl
  const paletteSprawl = palette.totalUniqueColors > 18;
  if (paletteSprawl) {
    score -= 10;
    summary.push(`Color palette sprawl: ${palette.totalUniqueColors} unique colors detected, recommended <= 12 (-10 pts)`);
  }

  // 6. AI Slop Tropes
  if (aiTropes.length > 0) {
    const penalty = Math.min(20, aiTropes.length * 5);
    score -= penalty;
    summary.push(`Detected ${aiTropes.length} generic AI / slop design tropes (-${penalty} pts)`);
  }

  if (summary.length === 0) {
    summary.push('Design exhibits clean 4/8pt spacing rhythm, passing WCAG contrast, and restrained palette');
  }

  return {
    score: Math.max(0, score),
    horizontalOverflow,
    totalUniqueColors: palette.totalUniqueColors,
    paletteSprawl,
    aiTropesDetected: aiTropes,
    contrastIssues: failingContrast.slice(0, 10),
    spacingIssues: spacingChecks.slice(0, 10),
    touchTargetIssues: touchTargets.slice(0, 10),
    occlusionIssues: occlusionChecks.slice(0, 10),
    asymmetricPaddingIssues: asymmetricPaddingChecks.slice(0, 10),
    textOverflowIssues: textOverflowChecks.slice(0, 10),
    focusOutlineIssues: focusOutlineChecks.slice(0, 10),
    disabledAffordanceIssues: disabledAffordanceChecks.slice(0, 10),
    summary
  };
}
