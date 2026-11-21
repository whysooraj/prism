import { simpleGit, type SimpleGit } from 'simple-git';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface RepoAcquisitionResult {
  localPath: string;
  isRemote: boolean;
  repoName: string;
  branch: string;
  commitHash?: string;
}

const CACHE_DIR = path.join(os.homedir(), '.cache', 'context-bridge', 'repos');

export async function acquireRepository(
  urlOrPath: string,
  branch?: string,
  authToken?: string
): Promise<RepoAcquisitionResult> {
  // 1. Check if local directory exists
  if (fs.existsSync(urlOrPath)) {
    const stat = fs.statSync(urlOrPath);
    if (stat.isDirectory()) {
      const git = simpleGit(urlOrPath);
      let currentBranch = 'unknown';
      let commitHash = undefined;

      try {
        const branchSummary = await git.branch();
        currentBranch = branchSummary.current || 'main';
        const log = await git.log({ maxCount: 1 });
        commitHash = log.latest?.hash;
      } catch {
        // Not a git repo or bare dir
      }

      return {
        localPath: path.resolve(urlOrPath),
        isRemote: false,
        repoName: path.basename(path.resolve(urlOrPath)),
        branch: currentBranch,
        commitHash
      };
    }
  }

  // 2. Treat as remote Git URL
  const parsed = parseGitUrl(urlOrPath);
  if (!parsed) {
    throw new Error(`Invalid repository URL or local path: "${urlOrPath}"`);
  }

  const { owner, repo } = parsed;
  const targetDir = path.join(CACHE_DIR, owner, repo);
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  let cloneUrl = urlOrPath;
  if (authToken && cloneUrl.startsWith('https://')) {
    cloneUrl = cloneUrl.replace('https://', `https://${authToken}@`);
  }

  const git: SimpleGit = simpleGit();

  if (fs.existsSync(path.join(targetDir, '.git'))) {
    // Existing repo - pull latest
    const localGit = simpleGit(targetDir);
    try {
      await localGit.fetch(['--depth', '1']);
      if (branch) {
        await localGit.checkout(branch);
      }
      await localGit.reset(['--hard', 'FETCH_HEAD']);
    } catch {
      // If pull fails, re-clone clean
      fs.rmSync(targetDir, { recursive: true, force: true });
      await cloneShallow(git, cloneUrl, targetDir, branch);
    }
  } else {
    fs.rmSync(targetDir, { recursive: true, force: true });
    await cloneShallow(git, cloneUrl, targetDir, branch);
  }

  const localGit = simpleGit(targetDir);
  const branchSummary = await localGit.branch();
  const log = await localGit.log({ maxCount: 1 });

  return {
    localPath: targetDir,
    isRemote: true,
    repoName: `${owner}/${repo}`,
    branch: branch || branchSummary.current || 'main',
    commitHash: log.latest?.hash
  };
}

async function cloneShallow(git: SimpleGit, url: string, targetDir: string, branch?: string) {
  const cloneArgs = ['--depth', '1'];
  if (branch) {
    cloneArgs.push('--branch', branch);
  }
  await git.clone(url, targetDir, cloneArgs);
}

function parseGitUrl(url: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo or git@github.com:owner/repo
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  const genericMatch = url.match(/\/([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (genericMatch) {
    return { owner: genericMatch[1], repo: genericMatch[2] };
  }

  return null;
}
