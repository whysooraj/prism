import { indexRepository, getRepoIndex, getRepoKey } from './repo-inspector.js';
import type { RepositoryIndexManager } from './symbol-index.js';

export interface ProjectSession {
  sessionId: string;
  repoName: string;
  repoPath: string;
  repoKey: string;
  appUrl?: string;
  totalFiles: number;
  totalSymbols: number;
  routesCount: number;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt: number;
}

export interface ConnectProjectOptions {
  repoPath: string;
  appUrl?: string;
  branch?: string;
  authToken?: string;
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const sessions = new Map<string, ProjectSession>();

export async function connectProject(options: ConnectProjectOptions): Promise<ProjectSession> {
  const { repoPath, appUrl, branch = 'main', authToken, ttlMs = DEFAULT_TTL_MS } = options;

  if (!repoPath || typeof repoPath !== 'string' || repoPath.trim().length === 0) {
    throw new Error('repoPath is required and must be a non-empty string');
  }

  const cleanRepoPath = repoPath.trim();
  const indexSummary = await indexRepository(cleanRepoPath, branch, authToken);
  const repoKey = getRepoKey(cleanRepoPath, indexSummary.branch);

  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const session: ProjectSession = {
    sessionId,
    repoName: indexSummary.repoName,
    repoPath: cleanRepoPath,
    repoKey,
    appUrl: appUrl && appUrl.trim().length > 0 ? appUrl.trim() : undefined,
    totalFiles: indexSummary.totalFiles,
    totalSymbols: indexSummary.totalSymbols,
    routesCount: indexSummary.routesCount,
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlMs
  };

  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): ProjectSession {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('sessionId is required for session-scoped operations');
  }

  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`Session not found: "${sessionId}". Call connect_project first.`);
  }

  const now = Date.now();
  if (now > session.expiresAt) {
    sessions.delete(sessionId);
    throw new Error(`Session "${sessionId}" has expired. Call connect_project to reconnect.`);
  }

  // Slide expiration window on access
  session.lastAccessedAt = now;
  session.expiresAt = now + DEFAULT_TTL_MS;

  return session;
}

export function getActiveSession(): ProjectSession | null {
  purgeStaleSessions();
  if (sessions.size === 1) {
    const s = sessions.values().next().value!;
    s.lastAccessedAt = Date.now();
    return s;
  }
  return null;
}

export function resolveSessionRepo(sessionId: string): {
  session: ProjectSession;
  repoIndex: RepositoryIndexManager;
} {
  const session = getSession(sessionId);
  const repoIndex = getRepoIndex(session.repoKey);
  return { session, repoIndex };
}

export function closeSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function purgeStaleSessions(): number {
  const now = Date.now();
  let purged = 0;
  for (const [id, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(id);
      purged++;
    }
  }
  return purged;
}

export function listSessions(): ProjectSession[] {
  purgeStaleSessions();
  return Array.from(sessions.values());
}

export function clearAllSessions(): void {
  sessions.clear();
}
