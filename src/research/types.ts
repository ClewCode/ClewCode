export type ResearchMode = 'quick' | 'deep' | 'compare' | 'paper' | 'codebase' | 'trend' | 'decision' | 'security';

export type ResearchSourceType =
  | 'web'
  | 'official_docs'
  | 'research_paper'
  | 'github_repo'
  | 'local_repo'
  | 'local_wiki'
  | 'local_memory';

export type ClaudeResearchConfig = {
  enabled: boolean;
  researchDir: string;
  defaultMode: ResearchMode;
  allowNetwork: boolean;
  allowGithub: boolean;
  allowRemoteMcp: boolean;
  maxSources: number;
  maxSourceTokens: number;
  saveReportsByDefault: boolean;
  saveMemoryPendingByDefault: boolean;
};

export type ResearchSource = {
  id: string;
  type: ResearchSourceType;
  title: string;
  url?: string;
  path?: string;
  retrievedAt: string;
  trust: 'high' | 'medium' | 'low';
  excerpt?: string;
};

export type ClaimStatus = 'supported' | 'partially_supported' | 'conflicting' | 'unsupported' | 'stale';

export type ResearchClaim = {
  id: string;
  claim: string;
  type: 'fact' | 'design_principle' | 'recommendation' | 'risk' | 'decision';
  status: ClaimStatus;
  confidence: 'high' | 'medium' | 'low';
  sourceIds: string[];
  notes?: string;
};

export type Citation = {
  id: string;
  sourceId: string;
  title: string;
  url?: string;
  path?: string;
  usedForClaims: string[];
};

export type ResearchPlan = {
  question: string;
  mode: ResearchMode;
  subQuestions: string[];
  sourceStrategy: ResearchSourceType[];
  doneCriteria: string[];
  risks: string[];
};

export type SynthesizerResult = {
  summary: string;
  consensusFindings: { topic: string; claims: string[]; sourceCount: number }[];
  conflicts: { topic: string; claimA: string; claimB: string; sources: string[] }[];
  gaps: string[];
  overallConfidence: 'high' | 'medium' | 'low';
};

export type ResearchRun = {
  id: string;
  query: string;
  mode: ResearchMode;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  sourceCount: number;
  claimCount: number;
  unsupportedClaimCount: number;
  savedToWiki: boolean;
  savedToMemoryPending: boolean;
};
