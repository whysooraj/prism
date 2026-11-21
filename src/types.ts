export interface BoxModel {
  margin: [number, number, number, number]; // top, right, bottom, left
  border: [number, number, number, number];
  padding: [number, number, number, number];
  width: number;
  height: number;
}

export interface NodeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeStyles {
  display: string;
  position: string;
  color: string;
  backgroundColor: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  borderRadius?: string;
  gap?: string;
}

export interface LayoutNode {
  tag: string;
  id?: string;
  classes: string[];
  role?: string;
  textSnippet?: string;
  rect: NodeRect;
  boxModel: BoxModel;
  styles: NodeStyles;
  children: LayoutNode[];
}

export interface ColorEntry {
  color: string;
  count: number;
}

export interface DesignPalette {
  backgrounds: ColorEntry[];
  textColors: ColorEntry[];
  accents: ColorEntry[];
  totalUniqueColors: number;
}

export interface TypographyToken {
  family: string;
  size: string;
  weight: string;
  lineHeight: string;
  count: number;
}

export interface TypographyScale {
  fontFamilies: string[];
  tokens: TypographyToken[];
}

export interface ContrastIssue {
  element: string;
  selector: string;
  fg: string;
  bg: string;
  contrastRatio: number;
  requiredRatio: number;
  passesAA: boolean;
}

export interface SpacingIssue {
  element: string;
  selector: string;
  property: string;
  value: string;
  offGridReason: string;
}

export interface TouchTargetIssue {
  element: string;
  selector: string;
  width: number;
  height: number;
}

export interface DesignCritique {
  score: number; // 0 - 100
  horizontalOverflow: boolean;
  totalUniqueColors: number;
  paletteSprawl: boolean;
  aiTropesDetected: string[];
  contrastIssues: ContrastIssue[];
  spacingIssues: SpacingIssue[];
  touchTargetIssues: TouchTargetIssue[];
  summary: string[];
}

export interface InteractiveElement {
  tag: string;
  type?: string;
  selector: string;
  text: string;
  rect: NodeRect;
  disabled?: boolean;
}

export interface WebInspectionResult {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  palette: DesignPalette;
  typography: TypographyScale;
  critique: DesignCritique;
  layoutTree: LayoutNode;
  interactiveElements: InteractiveElement[];
  wireframeSvg?: string;
  accessibilityTree?: any;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'route'
  | 'import'
  | 'export';

export interface CodeSymbol {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  exported: boolean;
  calls?: string[];
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: string;
  file: string;
  line: number;
}

export interface RepoMetadata {
  urlOrPath: string;
  name: string;
  branch: string;
  commitHash?: string;
  indexedAt: string;
  totalFiles: number;
  languages: Record<string, number>;
  entryPoints: string[];
  configs: Record<string, any>;
  routes: RouteDefinition[];
}
