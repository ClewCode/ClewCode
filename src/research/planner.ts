import type { ResearchMode, ResearchPlan, ResearchSourceType } from './types.js';

export function createResearchPlan(query: string, mode: ResearchMode): ResearchPlan {
  const subQuestions: string[] = [];
  const sourceStrategy: ResearchSourceType[] = ['local_repo', 'local_wiki', 'local_memory'];
  const doneCriteria: string[] = [];
  const risks: string[] = [];

  // Question deconstruction templates based on mode
  switch (mode) {
    case 'compare':
      subQuestions.push(
        `What are the core components and features of the options in: "${query}"?`,
        `What are the strengths and weaknesses of each option relative to Ceph Code?`,
        `Which option has the best integration path and lowest risk?`,
      );
      doneCriteria.push(
        'Comparison matrix with strengths/weaknesses created',
        'Recommendation with clear rationale formulated',
        'At least 3 source references cited',
      );
      risks.push(
        'Stale repository data (e.g. outdated dependency lists)',
        'Biased comparisons in online documentation',
      );
      break;

    case 'deep':
      subQuestions.push(
        `What is the underlying mechanism or spec for: "${query}"?`,
        `What are the best practices and design patterns recommended for this?`,
        `Are there any known bugs, pitfalls, or edge cases in our codebase?`,
        `How should we design the implementation for Ceph Code?`,
      );
      doneCriteria.push(
        'Deep-dive analysis of official docs and repo context completed',
        'Factual claims supported by explicit citations',
        'Clear, actionable implementation plan generated',
      );
      risks.push(
        'High volume of potential sources resulting in context limit pressure',
        'Security or prompt injection vulnerabilities in untrusted sources',
      );
      break;

    case 'quick':
    default:
      subQuestions.push(
        `What is the quick definition and context for: "${query}"?`,
        `What files in our codebase are related to this query?`,
      );
      doneCriteria.push('Summary report with key facts generated', 'Related files identified and analyzed');
      risks.push('Limited source depth may miss subtle edge cases');
      break;
  }

  // Adjust done criteria based on mode
  if (mode === 'security') {
    subQuestions.push(
      `Are there any security implications or threat models related to: "${query}"?`,
      `What mitigations are currently in place or need to be added?`,
    );
    doneCriteria.push('Security audit report with risk level and mitigation plan completed');
    risks.push('Incomplete threat analysis due to hidden code paths');
  }

  return {
    question: query,
    mode,
    subQuestions,
    sourceStrategy,
    doneCriteria,
    risks,
  };
}
