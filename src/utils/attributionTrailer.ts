import type { AttributionData, AttributionState } from './commitAttribution.js';

/**
 * Build PR body trailers for squash-merge attribution survival.
 *
 * Generates git trailer lines that are appended to the PR body. When the repo
 * is configured with squash_merge_commit_message=PR_BODY, these survive into
 * the squash commit body as proper git trailers.
 *
 * Extracted to its own module for tree-shaking — the COMMIT_ATTRIBUTION build
 * flag gates the entire feature, so this module is dead code in external builds.
 */
export function buildPRTrailers(
  attributionData: AttributionData,
  attributionState: AttributionState,
): string[] {
  const trailers: string[] = [];

  // Surface trailers: which surfaces contributed
  for (const [surface, breakdown] of Object.entries(attributionData.surfaceBreakdown)) {
    trailers.push(`Claude-contribution-${surface}: ${breakdown.claudeChars} chars (${breakdown.percent.toFixed(1)}%)`);
  }

  // Prompt count trailer
  trailers.push(`Claude-prompts: ${attributionState.promptCount}`);

  // Permission prompt count trailer
  if (attributionState.permissionPromptCount > 0) {
    trailers.push(`Claude-permissions: ${attributionState.permissionPromptCount}`);
  }

  // Session trailer
  if (attributionData.sessions.length > 0) {
    // Only include the first session ID as a reference
    trailers.push(`Claude-session: ${attributionData.sessions[0]}`);
  }

  // Generated files excluded from attribution
  if (attributionData.excludedGenerated.length > 0) {
    trailers.push(`Claude-generated-excluded: ${attributionData.excludedGenerated.length} files`);
  }

  return trailers;
}
