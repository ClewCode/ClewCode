/**
 * Long-Term Memory System
 *
 * Like human memory:
 * - Recent → รายละเอียดครบ (raw sessions last 7 days)
 * - Medium → สรุป weekly (consolidated sessions)
 * - Old → สรุป monthly (digests)
 * - Ancient → เก็บ pattern, ปล่อย detail
 */

export { getConsolidationCandidates, previewConsolidation, saveConsolidatedDigest } from './consolidate.js';
export type { SessionRecord } from './crossSession.js';
export { getDigests, getPreviousSessionContext, getSessionHistory, saveSessionSummary } from './crossSession.js';
export {
  applyCorrection,
  awardNodeXP,
  getColdNodes,
  getExperienceReport,
  getExpertiseProfile,
  getTopNodes,
} from './experience.js';
export type { EdgeType, GraphEdge, GraphNode, NodeType } from './graph.js';
export {
  findNodes,
  getGraphStats,
  getRelatedSessions,
  getSessionGraph,
  recordSessionGraph,
  traverse,
} from './graph.js';
export type { DensityStats, TimelineRow } from './timeline.js';
export { computeDensity, formatDigests, formatTimeline, queryTimeline } from './timeline.js';
// Dream/Distill are handled by src/services/autoDream/ (built-in cron scheduling).
// The standalone dream.ts/distill.ts in this directory are kept for reference only
// and should be activated if autoDream/ is unavailable.
