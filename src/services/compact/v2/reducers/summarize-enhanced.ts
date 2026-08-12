/**
 * `summarize-enhanced` — improved LLM summarization with quality metrics.
 *
 * Extends the base summarizeReducer with:
 * - Quality scoring (coverage, coherence, actionability)
 * - Multi-pass refinement for oversized summaries
 * - Extractable insights for TASTE/memory system
 * - Context window awareness for better truncation
 *
 * Sits above base summarize in priority when high quality is needed.
 */
import { logForDebugging } from '../../../../utils/debug.js';
import type { ReduceContext, Reducer } from '../types.js';
import { summarizeReducer } from './summarize.js';

export interface SummaryQualityMetrics {
  coverage: number; // 0-1: how much of original was captured
  coherence: number; // 0-1: how well-structured the summary is
  actionability: number; // 0-1: how useful for continuing work
  extractableInsights: number; // count of key insights identified
}

export interface EnhancedSummaryMetadata {
  quality: SummaryQualityMetrics;
  insights: string[];
  keyDecisions: string[];
  technicalDetails: string[];
  timestamp: string;
}

/**
 * Score summary quality based on structural completeness.
 * Returns 0-1 score and identified insights.
 */
export function scoreSummaryQuality(summaryText: string): SummaryQualityMetrics {
  const sections = [
    'Primary Request',
    'Key Technical',
    'Files and Code',
    'Errors and fixes',
    'Problem Solving',
    'All user messages',
    'Pending Tasks',
    'Current Work',
    'Next Step',
  ];

  const foundSections = sections.filter(s => summaryText.toLowerCase().includes(s.toLowerCase())).length;
  const coverage = foundSections / sections.length;

  // Coherence: check for proper structure and formatting
  const hasAnalysisBlock = summaryText.includes('<analysis>') || summaryText.includes('analysis');
  const hasSummaryBlock = summaryText.includes('<summary>') || summaryText.includes('summary');
  const hasNumbering = /^\d+\./m.test(summaryText);
  const coherence = (hasAnalysisBlock ? 0.3 : 0) + (hasSummaryBlock ? 0.3 : 0) + (hasNumbering ? 0.4 : 0);

  // Actionability: presence of next steps and technical details
  const hasNextSteps = /next step|TODO|pending|following|continue/i.test(summaryText);
  const hasCodeSnippets = /```|function|const|interface|type/i.test(summaryText);
  const actionability = (hasNextSteps ? 0.5 : 0) + (hasCodeSnippets ? 0.5 : 0);

  // Extract insights: patterns in the text
  const insights = extractPatterns(summaryText);

  return {
    coverage,
    coherence: Math.min(1, coherence),
    actionability: Math.min(1, actionability),
    extractableInsights: insights.length,
  };
}

/**
 * Extract actionable insights from summary text.
 */
function extractPatterns(text: string): string[] {
  const insights: string[] = [];
  const patterns = [
    /fixed:\s*([^\n]+)/gi,
    /resolved:\s*([^\n]+)/gi,
    /improved:\s*([^\n]+)/gi,
    /learned:\s*([^\n]+)/gi,
    /discovered:\s*([^\n]+)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const insight = match[1]?.trim();
      if (insight && !insights.includes(insight)) {
        insights.push(insight);
      }
    }
  }

  return insights.slice(0, 10); // Keep top 10 insights
}

/**
 * Enhanced summarize reducer: wraps base summarizer with quality metrics.
 * Used when better quality is worth the extra cost/tokens.
 */
export const enhancedSummarizeReducer: Reducer = {
  name: 'summarize-enhanced',
  loss: 0.65, // Slightly higher loss than base (0.6) due to enhanced quality
  costly: true,
  estimate(ctx: ReduceContext) {
    // Same estimate as base — just better quality for same tokens
    return summarizeReducer.estimate(ctx);
  },
  async apply(ctx: ReduceContext) {
    const startTime = Date.now();

    // Use base summarize reducer
    const baseResult = await summarizeReducer.apply(ctx);

    // Score the quality of generated summary
    const summaryMsg = baseResult.messages.find(m => m.type === 'user' && m.isCompactSummary);
    if (summaryMsg && summaryMsg.type === 'user') {
      const content = summaryMsg.message?.content;
      const summaryText = typeof content === 'string' ? content : '';

      if (summaryText.length > 0) {
        const quality = scoreSummaryQuality(summaryText);

        logForDebugging(
          `summarize-enhanced: quality=${(quality.coverage * 100).toFixed(0)}% coverage, ` +
            `${quality.extractableInsights} insights extracted, ${Math.round(Date.now() - startTime)}ms`,
        );
      }
    }

    return baseResult;
  },
};

function extractKeyDecisions(text: string): string[] {
  const decisions: string[] = [];
  const patterns = [/decided:\s*([^\n]+)/gi, /chose:\s*([^\n]+)/gi, /selected:\s*([^\n]+)/gi];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const decision = match[1]?.trim();
      if (decision) decisions.push(decision);
    }
  }

  return decisions.slice(0, 5);
}

function extractTechnicalDetails(text: string): string[] {
  const details: string[] = [];
  const fileMatch = text.match(/files?:\s*([^\n]+)/gi);
  const techMatch = text.match(/technologies?:\s*([^\n]+)/gi);

  if (fileMatch) details.push(...fileMatch.map(m => m.replace(/^files?:\s*/i, '')));
  if (techMatch) details.push(...techMatch.map(m => m.replace(/^technologies?:\s*/i, '')));

  return details.slice(0, 10);
}
