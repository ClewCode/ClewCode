/**
 * Insight extraction system — turns compact summaries into structured learnings.
 *
 * Post-compact hook that:
 * - Extracts key insights from summary
 * - Formats for TASTE system memory integration
 * - Identifies patterns and decisions
 * - Creates reusable knowledge snippets
 *
 * Feeds directly into memory/compacter.js autoExtractFromSession for TASTE.
 */
import type { Message } from '../../../types/message.js';
import { logForDebugging } from '../../../utils/debug.js';

export interface ExtractedInsight {
  type: 'decision' | 'pattern' | 'fix' | 'learning' | 'pattern-discovered';
  content: string;
  confidence: number; // 0-1
  relatedFiles?: string[];
  timestamp: string;
}

export interface InsightExtractionResult {
  insights: ExtractedInsight[];
  summary: string;
  keyTechnologies: string[];
}

/**
 * Extract structured insights from compact summary for TASTE learning.
 * Returns insights formatted for memory system integration.
 */
export function extractInsightsFromSummary(summaryText: string): InsightExtractionResult {
  const insights: ExtractedInsight[] = [];
  const timestamp = new Date().toISOString();

  // Extract decisions (high confidence)
  const decisionPatterns = [/\*\*Decision:\s*([^*]+)\*\*/g, /decided to ([^\n]+)/gi];
  for (const pattern of decisionPatterns) {
    let match;
    while ((match = pattern.exec(summaryText)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length < 200) {
        insights.push({
          type: 'decision',
          content,
          confidence: 0.95,
          timestamp,
        });
      }
    }
  }

  // Extract fixes (high confidence)
  const fixPatterns = [/fixed:\s*([^\n]+)/gi, /resolved:\s*([^\n]+)/gi];
  for (const pattern of fixPatterns) {
    let match;
    while ((match = pattern.exec(summaryText)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length < 200) {
        insights.push({
          type: 'fix',
          content,
          confidence: 0.9,
          timestamp,
        });
      }
    }
  }

  // Extract patterns (medium confidence)
  const patternPatterns = [/pattern:\s*([^\n]+)/gi, /discovered:\s*([^\n]+)/gi];
  for (const pattern of patternPatterns) {
    let match;
    while ((match = pattern.exec(summaryText)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length < 200) {
        insights.push({
          type: 'pattern-discovered',
          content,
          confidence: 0.75,
          timestamp,
        });
      }
    }
  }

  // Extract learnings (medium-high confidence)
  const learningPatterns = [/learned:\s*([^\n]+)/gi, /important:\s*([^\n]+)/gi];
  for (const pattern of learningPatterns) {
    let match;
    while ((match = pattern.exec(summaryText)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length < 200) {
        insights.push({
          type: 'learning',
          content,
          confidence: 0.8,
          timestamp,
        });
      }
    }
  }

  // Extract file references
  const fileMatches = summaryText.match(/src\/[\w\-./]+\.(ts|tsx|js|jsx)/g) || [];
  const uniqueFiles = [...new Set(fileMatches)];

  // Attach files to most recent insights
  for (let i = Math.max(0, insights.length - 5); i < insights.length && uniqueFiles.length > 0; i++) {
    if (insights[i]) {
      insights[i]!.relatedFiles = uniqueFiles.slice(0, 3);
    }
  }

  // Extract key technologies from summary
  const techKeywords = ['TypeScript', 'React', 'Ink', 'Bun', 'Rust', 'API', 'CLI', 'SDK', 'MCP', 'Anthropic', 'Claude'];
  const keyTechnologies = techKeywords.filter(tech => summaryText.toLowerCase().includes(tech.toLowerCase()));

  // Limit to top insights by confidence
  const topInsights = insights.sort((a, b) => b.confidence - a.confidence).slice(0, 10);

  const summary = `${topInsights.length} insights extracted: ${topInsights
    .map(i => `${i.type}(${(i.confidence * 100).toFixed(0)}%)`)
    .join(', ')}`;

  logForDebugging(`insight-extraction: ${summary}`);

  return {
    insights: topInsights,
    summary,
    keyTechnologies,
  };
}

/**
 * Format insights for TASTE system as code-fence blocks.
 * TASTE learns from markdown code blocks in memory files.
 */
export function formatInsightsForTASTE(result: InsightExtractionResult): string {
  const blocks: string[] = [];

  for (const insight of result.insights) {
    blocks.push(`\`\`\`insight-${insight.type}\n${insight.content}\n\`\`\``);
  }

  if (result.keyTechnologies.length > 0) {
    blocks.push(`\`\`\`tech-stack\n${result.keyTechnologies.join(', ')}\n\`\`\``);
  }

  return blocks.join('\n\n');
}

/**
 * Hook: process compact results to extract insights.
 * Called automatically after successful compaction.
 */
export async function processCompactInsights(messages: Message[]): Promise<InsightExtractionResult | null> {
  const summaryMsg = messages.find(m => m.type === 'user' && m.isCompactSummary);
  if (!summaryMsg || summaryMsg.type !== 'user') return null;

  const content = summaryMsg.message?.content;
  const summaryText = typeof content === 'string' ? content : '';

  if (!summaryText) return null;

  try {
    const result = extractInsightsFromSummary(summaryText);

    logForDebugging(`compact-insights: ${result.summary}`);

    return result;
  } catch (err) {
    logForDebugging(`compact-insights extraction failed: ${err}`);
    return null;
  }
}
