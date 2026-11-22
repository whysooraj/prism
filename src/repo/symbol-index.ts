import * as fs from 'fs';
import * as path from 'path';
import type { CodeSymbol, RepoMetadata, RouteDefinition, SymbolKind } from '../types.js';
import type { ReExportDefinition } from './parser.js';

export interface SearchMatch {
  symbol: CodeSymbol;
  score: number;
  snippet?: string;
}

export interface CallerInfo {
  name: string;
  kind: SymbolKind;
  filePath: string;
  startLine: number;
  signature?: string;
}

export interface CalleeInfo {
  calledName: string;
  targetDefinitions: Array<{
    name: string;
    filePath: string;
    line: number;
    kind: SymbolKind;
  }>;
}

export interface SymbolTraceResult {
  definitions: CodeSymbol[];
  importedBy: string[];
  reExportedBy: string[];
  callers: CallerInfo[];
  callees: CalleeInfo[];
  connectedRoutes: RouteDefinition[];
}

export class RepositoryIndexManager {
  private metadata: RepoMetadata;
  private symbols: CodeSymbol[] = [];
  private routes: RouteDefinition[] = [];
  private fileTree: string[] = [];
  private fileSet: Set<string> = new Set();
  private importsMap: Map<string, string[]> = new Map(); // filePath -> imports
  private reExportsMap: Map<string, ReExportDefinition[]> = new Map(); // filePath -> reExports
  private rootDir: string;

  constructor(rootDir: string, metadata: RepoMetadata) {
    this.rootDir = rootDir;
    this.metadata = metadata;
  }

  public addFileResult(
    relativeFilePath: string,
    symbols: CodeSymbol[],
    routes: RouteDefinition[],
    imports: string[],
    reExports?: ReExportDefinition[]
  ) {
    this.fileTree.push(relativeFilePath);
    this.fileSet.add(relativeFilePath);
    for (const sym of symbols) {
      this.symbols.push(sym);
    }
    for (const r of routes) {
      this.routes.push(r);
    }
    this.importsMap.set(relativeFilePath, imports);
    if (reExports && reExports.length > 0) {
      this.reExportsMap.set(relativeFilePath, reExports);
    }
  }

  public finalizeMetadata(configs: Record<string, any>, languages: Record<string, number>, entryPoints: string[]) {
    this.metadata.totalFiles = this.fileTree.length;
    this.metadata.configs = configs;
    this.metadata.languages = languages;
    this.metadata.entryPoints = entryPoints;
    this.metadata.routes = this.routes;
  }

  public getMetadata(): RepoMetadata {
    return this.metadata;
  }

  public getFileTree(): string[] {
    return this.fileTree;
  }

  public getRoutes(): RouteDefinition[] {
    return this.routes;
  }

  public getTotalSymbols(): number {
    return this.symbols.length;
  }

  public search(query: string, kind?: SymbolKind, limit = 20): SearchMatch[] {
    const qLower = query.toLowerCase().trim();
    const queryTerms = qLower.split(/\s+/).filter(Boolean);
    const results: SearchMatch[] = [];

    for (const sym of this.symbols) {
      if (kind && sym.kind !== kind) continue;

      const symNameLower = sym.name.toLowerCase();
      const pathLower = sym.filePath.toLowerCase();
      const sigLower = (sym.signature || '').toLowerCase();

      let score = 0;

      // Exact match
      if (symNameLower === qLower) {
        score += 100;
      } else if (symNameLower.includes(qLower)) {
        score += 50;
      }

      // Keyword matching
      for (const term of queryTerms) {
        if (symNameLower.includes(term)) score += 20;
        if (pathLower.includes(term)) score += 15;
        if (sigLower.includes(term)) score += 10;
      }

      // Boost exported symbols
      if (sym.exported) score += 5;

      if (score > 0) {
        results.push({ symbol: sym, score });
      }
    }

    // Also match routes if searching for endpoints / api
    if (queryTerms.some((t) => ['route', 'api', 'endpoint', 'http', 'get', 'post', 'auth', 'login'].includes(t))) {
      for (const r of this.routes) {
        const routeStr = `${r.method} ${r.path} ${r.handler} ${r.file}`.toLowerCase();
        let rScore = 0;
        for (const term of queryTerms) {
          if (routeStr.includes(term)) rScore += 25;
        }
        if (rScore > 0) {
          results.push({
            symbol: {
              name: `${r.method} ${r.path}`,
              kind: 'route',
              filePath: r.file,
              startLine: r.line,
              endLine: r.line + 10,
              signature: `${r.method} ${r.path} -> ${r.handler}`,
              exported: true
            },
            score: rScore
          });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Resolves tsconfig path aliases and conventional @/ or ~/ alias mappings.
   */
  private getAliasMappings(): Array<{ prefix: string; target: string }> {
    const mappings: Array<{ prefix: string; target: string }> = [];

    const tsconfig = this.metadata.configs?.['tsconfig.json'];
    const baseUrl = (tsconfig?.compilerOptions?.baseUrl || '').replace(/^\.\/?/, '');
    const paths = tsconfig?.compilerOptions?.paths;

    if (paths && typeof paths === 'object') {
      for (const [pattern, targets] of Object.entries(paths)) {
        if (Array.isArray(targets) && targets.length > 0) {
          const rawTarget = targets[0] as string;
          const prefix = pattern.replace(/\*$/, '');
          let cleanTarget = rawTarget.replace(/^\.\/?/, '').replace(/\*$/, '');
          if (baseUrl && !cleanTarget.startsWith(baseUrl)) {
            cleanTarget = path.join(baseUrl, cleanTarget);
          }
          mappings.push({ prefix, target: cleanTarget });
        }
      }
    }

    // Ensure @/ and ~/ defaults exist if not configured
    const hasAtSlash = mappings.some((m) => m.prefix === '@/');
    const hasSrcDir = this.fileTree.some((f) => f.startsWith('src/'));
    if (!hasAtSlash) {
      mappings.push({ prefix: '@/', target: hasSrcDir ? 'src/' : '' });
    }

    const hasTildeSlash = mappings.some((m) => m.prefix === '~/');
    if (!hasTildeSlash) {
      mappings.push({ prefix: '~/', target: hasSrcDir ? 'src/' : '' });
    }

    return mappings;
  }

  /**
   * Resolves an import specifier (relative, alias, or crate/module) to an indexed file in the repo.
   */
  public resolveImport(fromFile: string, specifier: string): string | null {
    if (!specifier) return null;

    let candidatePath: string | null = null;

    // 1. Alias imports (e.g. @/components/Button, ~/utils, @components/Header)
    const aliases = this.getAliasMappings();
    for (const alias of aliases) {
      if (specifier.startsWith(alias.prefix)) {
        const sub = specifier.slice(alias.prefix.length);
        candidatePath = path.normalize(path.join(alias.target, sub));
        break;
      }
    }

    // 2. Relative imports (e.g. ./auth, ../services/user, ./git-manager.js)
    if (!candidatePath && (specifier.startsWith('./') || specifier.startsWith('../'))) {
      const dir = path.dirname(fromFile);
      candidatePath = path.normalize(path.join(dir, specifier));
    }

    // 3. Python relative imports (e.g. .models, ..services)
    if (!candidatePath && specifier.startsWith('.')) {
      const match = specifier.match(/^(\.+)(.*)/);
      if (match) {
        const dots = match[1].length;
        const rest = match[2].replace(/\./g, '/');
        let curDir = path.dirname(fromFile);
        for (let d = 1; d < dots; d++) {
          curDir = path.dirname(curDir);
        }
        candidatePath = path.normalize(path.join(curDir, rest));
      }
    }

    // 4. Rust crate imports (e.g. crate::services::auth)
    if (!candidatePath && specifier.startsWith('crate::')) {
      const rest = specifier.slice('crate::'.length).replace(/::/g, '/');
      candidatePath = path.normalize(path.join('src', rest));
    }

    // If no candidate could be derived, check if bare specifier matches a repo top-level dir or file
    if (!candidatePath) {
      const normalizedBare = specifier.replace(/::/g, '/').replace(/\./g, '/');
      if (this.fileTree.some((f) => f.startsWith(normalizedBare))) {
        candidatePath = normalizedBare;
      }
    }

    if (!candidatePath) return null;

    // Clean Windows backslashes if present
    candidatePath = candidatePath.replace(/\\/g, '/');

    // Attempt direct match
    if (this.fileSet.has(candidatePath)) {
      return candidatePath;
    }

    // TypeScript ESM handling: ./foo.js -> ./foo.ts or ./foo.tsx
    if (candidatePath.endsWith('.js') || candidatePath.endsWith('.mjs') || candidatePath.endsWith('.jsx')) {
      const baseWithoutExt = candidatePath.slice(0, candidatePath.lastIndexOf('.'));
      for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const testP = baseWithoutExt + ext;
        if (this.fileSet.has(testP)) {
          return testP;
        }
      }
    }

    // Extension probe
    const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.json'];
    for (const ext of EXTENSIONS) {
      const withExt = candidatePath + ext;
      if (this.fileSet.has(withExt)) {
        return withExt;
      }
    }

    // Index file probe
    const INDEX_EXTS = [
      '/index.ts',
      '/index.tsx',
      '/index.js',
      '/index.jsx',
      '/__init__.py',
      '/mod.rs'
    ];
    for (const idxExt of INDEX_EXTS) {
      const withIdx = candidatePath + idxExt;
      if (this.fileSet.has(withIdx)) {
        return withIdx;
      }
    }

    return null;
  }

  /**
   * Upgraded traceSymbol:
   * - Resolves relative module imports (e.g. './auth' -> './auth.ts')
   * - Resolves alias module imports (e.g. '@/components/Button' -> 'src/components/Button.tsx')
   * - Resolves re-exports (e.g. 'export * from ./auth' or 'export { auth } from ./auth')
   * - Performs call graph tracking: links calls within functions to their definition symbols and callers.
   */
  public traceSymbol(name: string): SymbolTraceResult {
    const nameLower = name.toLowerCase();

    // 1. Symbol definitions
    const definitions = this.symbols.filter((s) => s.name.toLowerCase() === nameLower);

    // 2. Direct and resolved import tracking
    const importedBySet = new Set<string>();
    const reExportedBySet = new Set<string>();

    for (const def of definitions) {
      const defFile = def.filePath;
      const defBase = path.basename(defFile, path.extname(defFile));

      for (const [importerFile, fileImports] of this.importsMap.entries()) {
        if (importerFile === defFile) continue;

        let isMatch = false;
        for (const imp of fileImports) {
          const resolved = this.resolveImport(importerFile, imp);
          if (resolved === defFile) {
            isMatch = true;
            break;
          }
          // Fallback to basename substring if unresolved
          if (resolved === null && imp.includes(defBase)) {
            isMatch = true;
            break;
          }
        }

        if (isMatch) {
          importedBySet.add(importerFile);
        }
      }

      // 3. Re-export tracking: check if any file re-exports defFile
      for (const [exporterFile, reExports] of this.reExportsMap.entries()) {
        for (const rx of reExports) {
          const resolved = this.resolveImport(exporterFile, rx.fromModule);
          if (resolved === defFile) {
            // Does this re-export export all (*) or explicitly export this symbol name?
            const matchesName = rx.exportedNames.includes('*') || rx.exportedNames.some((n) => n.toLowerCase() === nameLower);
            if (matchesName) {
              reExportedBySet.add(exporterFile);
              importedBySet.add(exporterFile);

              // Downstream consumers: any file importing exporterFile is also importing this symbol
              for (const [consumerFile, consumerImports] of this.importsMap.entries()) {
                if (consumerFile === exporterFile || consumerFile === defFile) continue;
                for (const cImp of consumerImports) {
                  const resolvedConsumer = this.resolveImport(consumerFile, cImp);
                  if (resolvedConsumer === exporterFile) {
                    importedBySet.add(consumerFile);
                    break;
                  }
                }
              }
            }
          }
        }
      }
    }

    // 4. Call graph tracking
    // A. Callers: which symbols call `name`?
    const callers: CallerInfo[] = [];
    const seenCallers = new Set<string>();

    for (const sym of this.symbols) {
      if (!sym.calls || sym.calls.length === 0) continue;
      const callsThisSymbol = sym.calls.some((c) => {
        const cLower = c.toLowerCase();
        return cLower === nameLower || cLower.endsWith('.' + nameLower) || cLower.endsWith('::' + nameLower);
      });

      if (callsThisSymbol) {
        const key = `${sym.filePath}::${sym.name}::${sym.startLine}`;
        if (!seenCallers.has(key)) {
          seenCallers.add(key);
          callers.push({
            name: sym.name,
            kind: sym.kind,
            filePath: sym.filePath,
            startLine: sym.startLine,
            signature: sym.signature
          });
        }
      }
    }

    // B. Callees: what symbols do the definitions of `name` call?
    const callees: CalleeInfo[] = [];
    const seenCalleeCalls = new Set<string>();

    for (const def of definitions) {
      if (!def.calls) continue;
      for (const callName of def.calls) {
        if (seenCalleeCalls.has(callName)) continue;
        seenCalleeCalls.add(callName);

        const targetDefs = this.symbols.filter((s) => s.name.toLowerCase() === callName.toLowerCase());
        callees.push({
          calledName: callName,
          targetDefinitions: targetDefs.map((td) => ({
            name: td.name,
            filePath: td.filePath,
            line: td.startLine,
            kind: td.kind
          }))
        });
      }
    }

    // 5. Connected routes
    const connectedRoutes = this.routes.filter((r) =>
      definitions.some((d) => d.filePath === r.file || r.handler.toLowerCase().includes(nameLower))
    );

    return {
      definitions,
      importedBy: Array.from(importedBySet),
      reExportedBy: Array.from(reExportedBySet),
      callers,
      callees,
      connectedRoutes
    };
  }

  public getFormattedFile(relativeFilePath: string, startLine?: number, endLine?: number): {
    filePath: string;
    totalLines: number;
    startLine: number;
    endLine: number;
    content: string;
  } {
    // Reject absolute paths
    if (path.isAbsolute(relativeFilePath)) {
      throw new Error(`Access denied: path traversal outside repository containment: ${relativeFilePath}`);
    }

    // Enforce strict containment within repository root to prevent path traversal
    const normalizedRelative = path.normalize(relativeFilePath);
    const resolvedPath = path.resolve(this.rootDir, normalizedRelative);
    const relFromRoot = path.relative(this.rootDir, resolvedPath);

    if (relFromRoot.startsWith('..') || path.isAbsolute(relFromRoot)) {
      throw new Error(`Access denied: path traversal outside repository containment: ${relativeFilePath}`);
    }

    // Verify symlink containment to prevent symlink traversal
    let realPath = resolvedPath;
    try {
      realPath = fs.realpathSync(resolvedPath);
      const realRel = path.relative(this.rootDir, realPath);
      if (realRel.startsWith('..') || path.isAbsolute(realRel)) {
        throw new Error(`Access denied: symlink points outside repository: ${relativeFilePath}`);
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new Error(`File not found: ${relativeFilePath}`);
      }
      throw err;
    }

    const raw = fs.readFileSync(realPath, 'utf-8');
    const lines = raw.split('\n');
    const totalLines = lines.length;

    const start = Math.max(1, startLine || 1);
    const end = Math.min(totalLines, endLine || totalLines);

    const slice = lines.slice(start - 1, end);
    const formatted = slice
      .map((line, idx) => {
        const lineNum = (start + idx).toString().padStart(4, ' ');
        return `${lineNum} | ${line}`;
      })
      .join('\n');

    return {
      filePath: relFromRoot,
      totalLines,
      startLine: start,
      endLine: end,
      content: formatted
    };
  }
}
