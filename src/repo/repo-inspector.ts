import * as fs from 'fs';
import * as path from 'path';
import { acquireRepository } from './git-manager.js';
import { parseSourceFile } from './parser.js';
import { RepositoryIndexManager } from './symbol-index.js';
import type { RepoMetadata } from '../types.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  '.cache'
]);

const IGNORED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.mp4', '.mp3',
  '.pdf', '.zip', '.tar', '.gz', '.wasm', '.lock', '.exe', '.bin', '.pyc',
  '.map'
]);

const repoRegistry: Map<string, RepositoryIndexManager> = new Map();
let lastActiveKey: string | null = null;
const MAX_REGISTRY_ENTRIES = 12;

export function getRepoKey(repoNameOrPath: string, branch = 'main'): string {
  return `${repoNameOrPath.trim().toLowerCase()}::${branch.trim().toLowerCase()}`;
}

export async function indexRepository(
  urlOrPath: string,
  branch?: string,
  authToken?: string
): Promise<{
  repoName: string;
  branch: string;
  commitHash?: string;
  totalFiles: number;
  totalSymbols: number;
  languages: Record<string, number>;
  entryPoints: string[];
  routesCount: number;
  summary: string;
}> {
  const acq = await acquireRepository(urlOrPath, branch, authToken);

  const metadata: RepoMetadata = {
    urlOrPath,
    name: acq.repoName,
    branch: acq.branch,
    commitHash: acq.commitHash,
    indexedAt: new Date().toISOString(),
    totalFiles: 0,
    languages: {},
    entryPoints: [],
    configs: {},
    routes: []
  };

  const manager = new RepositoryIndexManager(acq.localPath, metadata);
  const languages: Record<string, number> = {};
  const configs: Record<string, any> = {};
  const entryPoints: string[] = [];

  // Recursive scan
  function scanDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(acq.localPath, fullPath);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          scanDir(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IGNORED_EXTENSIONS.has(ext)) continue;

        // Language count
        if (ext) {
          const langName = ext.slice(1);
          languages[langName] = (languages[langName] || 0) + 1;
        }

        // Identify key configs
        if (['package.json', 'tsconfig.json', 'Cargo.toml', 'go.mod', 'pyproject.toml'].includes(entry.name)) {
          try {
            if (entry.name.endsWith('.json')) {
              configs[entry.name] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            } else {
              configs[entry.name] = fs.readFileSync(fullPath, 'utf-8').slice(0, 1000);
            }
          } catch {
            // Non-critical config parse
          }
        }

        // Identify entry points
        if (
          ['index.ts', 'main.ts', 'server.ts', 'app.ts', 'main.go', 'main.rs', 'app.py', 'main.py', 'index.js'].includes(
            entry.name
          )
        ) {
          entryPoints.push(relPath);
        }

        // Parse code file
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          // Limit 500KB per file to avoid memory bloat
          if (content.length < 500 * 1024) {
            const result = parseSourceFile(relPath, content);
            manager.addFileResult(relPath, result.symbols, result.routes, result.imports, result.reExports);
          }
        } catch {
          // File parsing fallback
        }
      }
    }
  }

  scanDir(acq.localPath);

  manager.finalizeMetadata(configs, languages, entryPoints);

  const key = getRepoKey(acq.repoName, acq.branch);
  const pathKey = getRepoKey(acq.localPath, acq.branch);

  if (repoRegistry.size >= MAX_REGISTRY_ENTRIES && !repoRegistry.has(key)) {
    const firstKey = repoRegistry.keys().next().value;
    if (firstKey) repoRegistry.delete(firstKey);
  }

  repoRegistry.set(key, manager);
  repoRegistry.set(pathKey, manager);
  lastActiveKey = key;

  return {
    repoName: acq.repoName,
    branch: acq.branch,
    commitHash: acq.commitHash,
    totalFiles: metadata.totalFiles,
    totalSymbols: manager.getTotalSymbols(),
    languages: metadata.languages,
    entryPoints: metadata.entryPoints,
    routesCount: metadata.routes.length,
    summary: `Indexed ${metadata.totalFiles} files in repository "${acq.repoName}". Found ${metadata.routes.length} HTTP routes and identified ${entryPoints.length} entry points.`
  };
}

export function clearRepoRegistry(): void {
  repoRegistry.clear();
  lastActiveKey = null;
}

export function getRepoIndex(repoIdentifier: string): RepositoryIndexManager {
  if (!repoIdentifier || typeof repoIdentifier !== 'string') {
    throw new Error('repoIdentifier must be a non-empty string');
  }
  const clean = repoIdentifier.toLowerCase().trim();
  const direct = repoRegistry.get(clean);
  if (direct) return direct;
  for (const [k, v] of repoRegistry.entries()) {
    if (k === clean || k.includes(clean) || clean.includes(k)) return v;
  }
  throw new Error(`Repository not found for identifier: "${repoIdentifier}". Call index_repository or connect_project first.`);
}

export function getActiveIndex(repoIdentifier?: string): RepositoryIndexManager {
  if (repoIdentifier) {
    return getRepoIndex(repoIdentifier);
  }

  // Count unique repository manager instances to distinguish multiple projects
  const uniqueRepos = new Set(repoRegistry.values());
  if (uniqueRepos.size === 1) {
    return uniqueRepos.values().next().value!;
  }
  if (uniqueRepos.size > 1) {
    throw new Error(
      `Multiple repositories are indexed (${uniqueRepos.size}). You must specify sessionId or repoIdentifier to isolate operations.`
    );
  }

  throw new Error('No repository has been indexed yet. Call connect_project or index_repository first.');
}

export function traceImpact(target: string, repoIdentifier?: string) {
  return getActiveIndex(repoIdentifier).traceImpact(target);
}

export function traceSymbol(symbolName: string, repoIdentifier?: string) {
  return getActiveIndex(repoIdentifier).traceSymbol(symbolName);
}

export function listIndexedRepositories(): Array<{ name: string; branch: string; files: number; symbols: number }> {
  const seen = new Set<RepositoryIndexManager>();
  const list = [];
  for (const manager of repoRegistry.values()) {
    if (seen.has(manager)) continue;
    seen.add(manager);
    const meta = manager.getMetadata();
    list.push({
      name: meta.name,
      branch: meta.branch,
      files: meta.totalFiles,
      symbols: manager.getTotalSymbols()
    });
  }
  return list;
}
