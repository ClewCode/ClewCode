/** Memory entry for UI display. */
export interface MemoryEntry {
  key: string;
  value: string;
  type: string;
  tags: string[];
  confidence: number;
  updatedAt: number;
  accessCount: number;
}

/** Timeline row for display. */
export interface TimelineEntry {
  date: string;
  sessionId: string;
  summary: string;
  model: string;
  tags: string[];
  decisions: string[];
  consolidated: number;
}

/** Dashboard stats. */
export interface MemoryDashboard {
  totalContexts: number;
  totalSessions: number;
  totalDecisions: number;
  byType: Record<string, number>;
  expertise: Array<{ topic: string; level: number; sessions: number }>;
  density: Array<{ date: string; count: number }>;
}
