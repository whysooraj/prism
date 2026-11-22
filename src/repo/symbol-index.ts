import * as fs from 'fs';
import * as path from 'path';
import type { CodeSymbol, RepoMetadata, RouteDefinition, SymbolKind } from '../types.js';

export interface SearchMatch {
  symbol: CodeSymbol;
  score: number;
  snippet?: string;
}

export class RepositoryIndexManager {
  private metadata: RepoMetadata;
  private symbols: CodeSymbol[] = [];
  private routes: RouteDefinition[] = [];
  private fileTree: string[] = [];
  private importsMap: Map<string, string[]> = new Map(); // filePath -> imports
  private rootDir: string;

  constructor(rootDir: string, metadata: RepoMetadata) {
    this.rootDir = rootDir;
    this.metadata = metadata;
  }

  public addFileResult(
    relativeFilePath: string,
    symbols: CodeSymbol[],
    routes: RouteDefinition[],
    imports: string[]
  ) {
    this.fileTree.push(relativeFilePath);
    for (const sym of symbols) {
      this.symbols.push(sym);
    }
    for (const r of routes) {
      this.routes.push(r);
    }
    this.importsMap.set(relativeFilePath, imports);
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

  public traceSymbol(name: string): {
    definitions: CodeSymbol[];
    importedBy: string[];
    connectedRoutes: RouteDefinition[];
  } {
    const definitions = this.symbols.filter(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    );

    const importedBy: string[] = [];
    for (const def of definitions) {
      const defBase = path.basename(def.filePath, path.extname(def.filePath));
      for (const [file, fileImports] of this.importsMap.entries()) {
        if (file === def.filePath) continue;
        const matches = fileImports.some((imp) => imp.includes(defBase));
        if (matches && !importedBy.includes(file)) {
          importedBy.push(file);
        }
      }
    }

    const connectedRoutes = this.routes.filter((r) =>
      definitions.some((d) => d.filePath === r.file || r.handler.toLowerCase().includes(name.toLowerCase()))
    );

    return { definitions, importedBy, connectedRoutes };
  }

  public getFormattedFile(relativeFilePath: string, startLine?: number, endLine?: number): {
    filePath: string;
    totalLines: number;
    startLine: number;
    endLine: number;
    content: string;
  } {
    const fullPath = path.isAbsolute(relativeFilePath)
      ? relativeFilePath
      : path.join(this.rootDir, relativeFilePath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${relativeFilePath}`);
    }

    const raw = fs.readFileSync(fullPath, 'utf-8');
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
      filePath: relativeFilePath,
      totalLines,
      startLine: start,
      endLine: end,
      content: formatted
    };
  }
}
