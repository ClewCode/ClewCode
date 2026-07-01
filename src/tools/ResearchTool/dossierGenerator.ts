import fs from 'fs';
import os from 'os';
import path from 'path';
import { logError } from '../../utils/log.js';
import type { DeepDiveResult } from './deepDive.js';
import type { TruthCheckResult } from './truthChecker.js';

export interface DossierData {
  query: string;
  timestamp: string;
  summary: string;
  technicalDetails: string;
  sources: Array<{
    title: string;
    url: string;
    type: string;
    credibilityScore?: number;
    excerpt: string;
  }>;
  deepDiveResults?: DeepDiveResult[];
  truthCheckResult?: TruthCheckResult;
  followUpQuestions?: string[];
  codeExamples?: Array<{
    language: string;
    code: string;
    description: string;
  }>;
}

export interface DossierOptions {
  outputDir?: string;
  filename?: string;
  includeDeepDive?: boolean;
  includeTruthCheck?: boolean;
  includeCodeExamples?: boolean;
}

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.clew', 'research-dossiers');

/**
 * Ensure the output directory exists
 */
function ensureOutputDir(outputDir: string): void {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  } catch (error) {
    logError(error as Error);
    throw new Error(`Failed to create output directory: ${outputDir}`);
  }
}

/**
 * Sanitize filename to remove invalid characters
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .substring(0, 100); // Limit length
}

/**
 * Extract code examples from content
 */
function extractCodeExamples(content: string): Array<{ language: string; code: string }> {
  const examples: Array<{ language: string; code: string }> = [];

  // Match code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();

    if (code.length > 10) {
      // Only include non-trivial examples
      examples.push({ language, code });
    }
  }

  return examples;
}

/**
 * Generate Markdown content for the dossier
 */
function generateMarkdownDossier(data: DossierData, options: DossierOptions = {}): string {
  const {
    query,
    timestamp,
    summary,
    technicalDetails,
    sources,
    deepDiveResults,
    truthCheckResult,
    followUpQuestions,
    codeExamples,
  } = data;

  let md = '';

  // Header
  md += `# Research Dossier: ${query}\n\n`;
  md += `**Generated:** ${timestamp}\n\n`;
  md += `---\n\n`;

  // Table of Contents
  md += `## Table of Contents\n\n`;
  md += `1. [Summary](#summary)\n`;
  md += `2. [Technical Details](#technical-details)\n`;
  md += `3. [Sources](#sources)\n`;

  if (deepDiveResults && deepDiveResults.length > 0) {
    md += `4. [Deep Dive Results](#deep-dive-results)\n`;
  }

  if (truthCheckResult && truthCheckResult.conflicts.length > 0) {
    md += `5. [Truth Check & Conflict Resolution](#truth-check--conflict-resolution)\n`;
  }

  if (codeExamples && codeExamples.length > 0) {
    md += `6. [Code Examples](#code-examples)\n`;
  }

  if (followUpQuestions && followUpQuestions.length > 0) {
    md += `7. [Follow-Up Questions](#follow-up-questions)\n`;
  }

  md += `\n---\n\n`;

  // Summary Section
  md += `## Summary\n\n${summary}\n\n`;

  // Technical Details Section
  md += `## Technical Details\n\n${technicalDetails}\n\n`;

  // Sources Section
  md += `## Sources\n\n`;

  // Sort sources by credibility score if available
  const sortedSources = [...sources].sort((a, b) => {
    const scoreA = a.credibilityScore || 0;
    const scoreB = b.credibilityScore || 0;
    return scoreB - scoreA;
  });

  sortedSources.forEach((source, index) => {
    md += `### ${index + 1}. ${source.title}\n\n`;
    md += `- **URL:** ${source.url}\n`;
    md += `- **Type:** ${source.type}\n`;

    if (source.credibilityScore !== undefined) {
      const scoreStars =
        '★'.repeat(Math.round(source.credibilityScore / 20)) + '☆'.repeat(5 - Math.round(source.credibilityScore / 20));
      md += `- **Credibility:** ${source.credibilityScore}/100 ${scoreStars}\n`;
    }

    md += `\n**Excerpt:**\n> ${source.excerpt}\n\n`;
  });

  // Deep Dive Results Section
  if (deepDiveResults && deepDiveResults.length > 0 && options.includeDeepDive !== false) {
    md += `---\n\n`;
    md += `## Deep Dive Results\n\n`;
    md += `The following content was gathered by following links up to 3 levels deep from the original search results.\n\n`;

    // Group by level
    const groupedByLevel = deepDiveResults.reduce(
      (acc, result) => {
        if (!acc[result.level]) {
          acc[result.level] = [];
        }
        acc[result.level].push(result);
        return acc;
      },
      {} as Record<number, DeepDiveResult[]>,
    );

    for (const level of Object.keys(groupedByLevel).map(Number).sort()) {
      md += `### Level ${level} Links\n\n`;

      groupedByLevel[level].forEach((result, index) => {
        md += `#### ${index + 1}. ${result.title}\n\n`;
        md += `- **URL:** ${result.originalUrl}\n`;

        if (result.error) {
          md += `- **Status:** ❌ Failed to fetch (${result.error})\n`;
        } else {
          md += `- **Content Length:** ${result.content.length} characters\n`;
          md += `- **Links Found:** ${result.links.length}\n`;
          md += `\n**Excerpt:**\n> ${result.excerpt}\n`;
        }

        md += `\n`;
      });
    }
  }

  // Truth Check & Conflict Resolution Section
  if (truthCheckResult && truthCheckResult.conflicts.length > 0 && options.includeTruthCheck !== false) {
    md += `---\n\n`;
    md += `## Truth Check & Conflict Resolution\n\n`;
    md += `${truthCheckResult.summary}\n\n`;

    truthCheckResult.conflicts.forEach((conflict, index) => {
      md += `### Conflict ${index + 1}: ${conflict.topic}\n\n`;
      md += `**Confidence Level:** ${conflict.confidence.toUpperCase()}\n\n`;

      md += `**Competing Claims:**\n\n`;
      conflict.claims.forEach((claim, claimIndex) => {
        md += `${claimIndex + 1}. ${claim.claim}\n`;
        md += `   - Supported by ${claim.sources.length} source(s)\n`;
        md += `   - Sources: ${claim.sources.slice(0, 2).join(', ')}${claim.sources.length > 2 ? '...' : ''}\n\n`;
      });

      if (conflict.resolution) {
        md += `**Resolution:**\n> ${conflict.resolution}\n\n`;
      }
    });

    // Credibility Scores
    if (truthCheckResult.credibilityScores.length > 0) {
      md += `### Source Credibility Scores\n\n`;
      md += `| Domain | Score | Type | Indicators |\n`;
      md += `|--------|-------|------|------------|\n`;

      truthCheckResult.credibilityScores
        .sort((a, b) => b.score - a.score)
        .forEach(cred => {
          md += `| ${cred.domain} | ${cred.score}/100 | ${cred.type} | ${cred.indicators.join(', ')} |\n`;
        });

      md += `\n`;
    }

    // Recommendations
    if (truthCheckResult.recommendations.length > 0) {
      md += `### Recommendations\n\n`;
      truthCheckResult.recommendations.forEach((rec, i) => {
        md += `${i + 1}. ${rec}\n`;
      });
      md += `\n`;
    }
  }

  // Code Examples Section
  if (codeExamples && codeExamples.length > 0 && options.includeCodeExamples !== false) {
    md += `---\n\n`;
    md += `## Code Examples\n\n`;

    codeExamples.forEach((example, index) => {
      md += `### Example ${index + 1}: ${example.description}\n\n`;
      md += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n\n`;
    });
  }

  // Follow-Up Questions Section
  if (followUpQuestions && followUpQuestions.length > 0) {
    md += `---\n\n`;
    md += `## Follow-Up Questions\n\n`;
    followUpQuestions.forEach((question, index) => {
      md += `${index + 1}. ${question}\n`;
    });
    md += `\n`;
  }

  // Footer
  md += `---\n\n`;
  md += `*Dossier generated by Clew Code Research Tool*\n`;
  md += `*Timestamp: ${timestamp}*\n`;

  return md;
}

/**
 * Save the research dossier to a Markdown file
 */
export async function saveDossier(data: DossierData, options: DossierOptions = {}): Promise<string> {
  const {
    outputDir = DEFAULT_OUTPUT_DIR,
    filename,
    includeDeepDive = true,
    includeTruthCheck = true,
    includeCodeExamples = true,
  } = options;

  try {
    // Ensure output directory exists
    ensureOutputDir(outputDir);

    // Generate filename if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = filename || `research_${sanitizeFilename(data.query)}_${timestamp}`;
    const fullFilename = baseFilename.endsWith('.md') ? baseFilename : `${baseFilename}.md`;
    const outputPath = path.join(outputDir, fullFilename);

    // Generate Markdown content
    const markdown = generateMarkdownDossier(data, {
      includeDeepDive,
      includeTruthCheck,
      includeCodeExamples,
    });

    // Write to file
    fs.writeFileSync(outputPath, markdown, 'utf-8');

    return outputPath;
  } catch (error) {
    logError(error as Error);
    throw new Error(`Failed to save dossier: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate dossier data from research results
 */
export function generateDossierData(
  query: string,
  answer: string,
  sources: Array<{ type: string; title: string; url: string; excerpt: string }>,
  deepDiveResults?: DeepDiveResult[],
  truthCheckResult?: TruthCheckResult,
  followUpQuestions?: string[],
): DossierData {
  // Extract code examples from the answer
  const codeExamples = extractCodeExamples(answer).map((example, index) => ({
    language: example.language,
    code: example.code,
    description: `Code example ${index + 1} from research`,
  }));

  // Enhance sources with credibility scores
  const enhancedSources = sources.map(source => {
    const credibility = truthCheckResult?.credibilityScores.find(c => {
      try {
        const sourceDomain = new URL(source.url).hostname.replace('www.', '');
        return sourceDomain === c.domain;
      } catch {
        return false;
      }
    });

    return {
      ...source,
      credibilityScore: credibility?.score,
    };
  });

  return {
    query,
    timestamp: new Date().toISOString(),
    summary: answer.split('\n').slice(0, 10).join('\n'), // First 10 lines as summary
    technicalDetails: answer,
    sources: enhancedSources,
    deepDiveResults,
    truthCheckResult,
    followUpQuestions,
    codeExamples: codeExamples.length > 0 ? codeExamples : undefined,
  };
}
