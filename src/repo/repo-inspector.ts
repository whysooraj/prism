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

let activeRepoIndex: RepositoryIndexManager | null = null;

export async function indexRepository(
  urlOrPath: string,
  branch?: string,
  authToken?: string
): Promise<{
  repoName: string;
  branch: string;
  commitHash?: string;
  totalFiles: number;
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
            manager.addFileResult(relPath, result.symbols, result.routes, result.imports);
          }
        } catch {
          // File parsing fallback
        }
      }
    }
  }

  scanDir(acq.localPath);

  manager.finalizeMetadata(configs, languages, entryPoints);
  activeRepoIndex = manager;

  return {
    repoName: acq.repoName,
    branch: acq.branch,
    commitHash: acq.commitHash,
    totalFiles: metadata.totalFiles,
    languages: metadata.languages,
    entryPoints: metadata.entryPoints,
    routesCount: metadata.routes.length,
    summary: `Indexed ${metadata.totalFiles} files in repository "${acq.repoName}". Found ${metadata.routes.length} HTTP routes and identified ${entryPoints.length} entry points.`
  };
}

export function getActiveIndex(): RepositoryIndexManager {
  if (!activeRepoIndex) {
    throw new Error('No repository has been indexed yet. Call index_repository first.');
  }
  return activeRepoIndex;
}
