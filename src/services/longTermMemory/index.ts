/**
 * Long-Term Memory System
 *
 * Like human memory:
 * - Recent → รายละเอียดครบ (raw sessions last 7 days)
 * - Medium → สรุป weekly (consolidated sessions)
 * - Old → สรุป monthly (digests)
 * - Ancient → เก็บ pattern, ปล่อย detail
 */
export { getPreviousSessionContext, saveSessionSummary, getSessionHistory, getDigests } from './crossSession.js';
export type { SessionRecord } from './crossSession.js';
export { queryTimeline, formatTimeline, formatDigests, computeDensity } from './timeline.js';
export type { TimelineRow, DensityStats } from './timeline.js';
export { getConsolidationCandidates, saveConsolidatedDigest, previewConsolidation } from './consolidate.js';
export {
  recordSessionGraph,
  findNodes,
  traverse,
  getSessionGraph,
  getRelatedSessions,
  getGraphStats,
} from './graph.js';
export type { GraphNode, GraphEdge, NodeType, EdgeType } from './graph.js';
export { awardNodeXP, getTopNodes, getColdNodes, getExperienceReport, getExpertiseProfile, applyCorrection } from './experience.js';
