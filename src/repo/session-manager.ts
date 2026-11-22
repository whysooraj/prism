import { indexRepository, getActiveIndex } from './repo-inspector.js';

export interface ProjectSession {
  sessionId: string;
  repoName: string;
  repoPath: string;
  appUrl?: string;
  totalFiles: number;
  totalSymbols: number;
  routesCount: number;
  indexedAt: string;
}

export interface ConnectProjectOptions {
  repoPath: string;
  appUrl?: string;
  branch?: string;
  authToken?: string;
}

let activeSession: ProjectSession | null = null;
const sessions = new Map<string, ProjectSession>();

export async function connectProject(options: ConnectProjectOptions): Promise<ProjectSession> {
  const { repoPath, appUrl, branch, authToken } = options;

  if (!repoPath) {
    throw new Error('repoPath is required to connect a project');
  }

  const indexSummary = await indexRepository(repoPath, branch, authToken);
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  const session: ProjectSession = {
    sessionId,
    repoName: indexSummary.repoName,
    repoPath,
    appUrl: appUrl ? appUrl.trim() : undefined,
    totalFiles: indexSummary.totalFiles,
    totalSymbols: indexSummary.totalSymbols,
    routesCount: indexSummary.routesCount,
    indexedAt: new Date().toISOString()
  };

  activeSession = session;
  sessions.set(sessionId, session);
  sessions.set(session.repoName.toLowerCase(), session);
  sessions.set(session.repoPath.toLowerCase(), session);

  return session;
}

export function getActiveSession(): ProjectSession | null {
  return activeSession;
}

export function getSession(identifier?: string): ProjectSession | null {
  if (!identifier) return activeSession;
  return sessions.get(identifier.toLowerCase()) || activeSession;
}
