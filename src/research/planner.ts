import type { ResearchMode, ResearchPlan, ResearchSourceType } from './types.js';

const MODE_PROMPTS: Record<ResearchMode, string> = {
  quick:
    'Quick surface-level scan. Focus on definitions, key facts, and codebase relevance. Keep sub-questions broad and actionable.',
  deep: 'In-depth analysis. Uncover underlying mechanisms, best practices, design patterns, known pitfalls, and implementation guidance.',
  compare:
    'Side-by-side comparison. Evaluate options by components, strengths, weaknesses, integration path, and risk. Produce a recommendation matrix.',
  paper: 'Academic research review. Look for peer-reviewed sources, formal citations, methodology critique, and research gaps. Prioritize papers over blog posts.',
  codebase:
    'Codebase-centric investigation. Trace dependency graphs, call chains, pattern usage, and architectural impact across the repository.',
  trend: 'Trend and time-series analysis. Decompose by date ranges, compare past vs present state, project direction. Look for momentum indicators.',
  decision:
    'Decision-support research. Extract pros/cons, score risks, map stakeholder impact, and produce an actionable recommendation with confidence levels.',
  security:
    'Security audit. Identify threat models, attack surfaces, existing mitigations, and gaps. Produce risk-ranked findings with remediation guidance.',
};

const SOURCE_STRATEGIES: Record<ResearchMode, ResearchSourceType[]> = {
  quick: ['local_repo', 'web'],
  deep: ['local_repo', 'local_wiki', 'local_memory', 'web', 'official_docs'],
  compare: ['web', 'official_docs', 'local_repo'],
  paper: ['web', 'research_paper', 'official_docs'],
  codebase: ['local_repo', 'local_wiki', 'github_repo'],
  trend: ['web', 'official_docs', 'github_repo'],
  decision: ['local_repo', 'local_wiki', 'local_memory', 'web'],
  security: ['local_repo', 'web', 'official_docs'],
};

/**
 * Template-based planner — fast, no LLM required.
 * Used as fallback when LLM is unavailable.
 */
export function createResearchPlan(query: string, mode: ResearchMode): ResearchPlan {
  const subQuestions: string[] = [];
  const doneCriteria: string[] = [];
  const risks: string[] = [];

  switch (mode) {
    case 'compare':
      subQuestions.push(
        `What are the core components and features of the options in: "${query}"?`,
        `What are the strengths and weaknesses of each option?`,
        `Which option has the best integration path and lowest risk?`,
      );
      doneCriteria.push(
        'Comparison matrix with strengths/weaknesses created',
        'Recommendation with clear rationale formulated',
        'At least 3 source references cited',
      );
      risks.push('Stale repository data', 'Biased comparisons in online documentation');
      break;

    case 'deep':
      subQuestions.push(
        `What is the underlying mechanism or spec for: "${query}"?`,
        `What are the best practices and design patterns recommended?`,
        `Are there any known bugs, pitfalls, or edge cases?`,
        `How should we design the implementation?`,
      );
      doneCriteria.push(
        'Deep-dive analysis of official docs and repo context completed',
        'Factual claims supported by explicit citations',
        'Clear, actionable implementation plan generated',
      );
      risks.push('High volume of sources → context limit pressure', 'Prompt injection in untrusted sources');
      break;

    case 'paper':
      subQuestions.push(
        `What does academic literature say about: "${query}"?`,
        `What are the key research papers, authors, and venues?`,
        `What methodologies are used and how do they compare?`,
        `What open questions or research gaps exist?`,
      );
      doneCriteria.push('Key papers identified with DOI/citation', 'Methodology comparison completed', 'Research gaps documented');
      risks.push('Paywalled papers inaccessible', 'Preprint quality varies widely');
      break;

    case 'codebase':
      subQuestions.push(
        `Where in the codebase does "${query}" appear?`,
        `What are the dependency relationships and call chains?`,
        `What patterns or anti-patterns exist around this area?`,
        `What would be the impact radius of changing this?`,
      );
      doneCriteria.push('File-level map of relevant code created', 'Dependency graph traced', 'Impact assessment completed');
      risks.push('Dynamic dispatch may hide real call graph', 'Large repos may hit search limits');
      break;

    case 'trend':
      subQuestions.push(
        `How has "${query}" evolved over the past year?`,
        `What are the current adoption trends and momentum indicators?`,
        `What do experts predict for the next 6-12 months?`,
        `What are the key events or releases that shaped this trend?`,
      );
      doneCriteria.push('Timeline of key events created', 'Trend direction scored', 'Prediction confidence stated');
      risks.push('Recency bias in search results', 'Hype cycles may distort adoption data');
      break;

    case 'decision':
      subQuestions.push(
        `What are the viable options for: "${query}"?`,
        `What are the pros and cons of each option?`,
        `What are the risks, costs, and trade-offs?`,
        `Which stakeholders are affected and how?`,
      );
      doneCriteria.push('Pro/con matrix for each option', 'Risk-weighted scoring completed', 'Clear recommendation with rationale');
      risks.push('Incomplete option space', 'Stakeholder impact may be underestimated');
      break;

    case 'security':
      subQuestions.push(
        `What are the threat models related to: "${query}"?`,
        `What attack surfaces exist and how are they protected?`,
        `What mitigations are in place and what gaps remain?`,
      );
      doneCriteria.push('Security audit report with risk levels', 'Mitigation plan documented', 'Each finding has severity rating');
      risks.push('Hidden code paths may be missed', 'Zero-day threats not covered');
      break;

    case 'quick':
    default:
      subQuestions.push(
        `What is the quick definition and context for: "${query}"?`,
        `What files in our codebase are related to this query?`,
      );
      doneCriteria.push('Summary report with key facts generated', 'Related files identified');
      risks.push('Limited source depth may miss subtle edge cases');
      break;
  }

  return {
    question: query,
    mode,
    subQuestions,
    sourceStrategy: SOURCE_STRATEGIES[mode] || ['local_repo', 'local_wiki', 'local_memory', 'web'],
    doneCriteria,
    risks,
  };
}

/**
 * LLM-driven planner — generates a research plan by asking the model to
 * deconstruct the query based on the research mode.
 *
 * Returns a ResearchPlan or null if the LLM call fails (caller should fall
 * back to createResearchPlan).
 */
export async function createResearchPlanLLM(
  query: string,
  mode: ResearchMode,
  ask: (prompt: string) => Promise<string>,
): Promise<ResearchPlan | null> {
  const modeGuidance = MODE_PROMPTS[mode] || MODE_PROMPTS.quick;

  const prompt = [
    `You are a research planner. Given a user's question and the research mode, deconstruct it into a structured plan.`,
    ``,
    `**Question:** ${query}`,
    `**Mode:** ${mode}`,
    `**Mode guidance:** ${modeGuidance}`,
    ``,
    `Return a JSON object with these fields:`,
    `- subQuestions: string[] (3-5 specific sub-questions that break down the main query)`,
    `- doneCriteria: string[] (3-5 observable conditions that mean the research is complete)`,
    `- risks: string[] (2-4 risks or pitfalls to watch for during research)`,
    ``,
    `Respond ONLY with valid JSON. No markdown, no explanation.`,
  ].join('\n');

  try {
    const response = await ask(prompt);
    // Strip possible markdown code fences
    const json = response.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(json) as {
      subQuestions?: string[];
      doneCriteria?: string[];
      risks?: string[];
    };

    if (!parsed.subQuestions?.length) return null;

    return {
      question: query,
      mode,
      subQuestions: parsed.subQuestions.slice(0, 5),
      sourceStrategy: SOURCE_STRATEGIES[mode] || ['local_repo', 'local_wiki', 'local_memory', 'web'],
      doneCriteria: parsed.doneCriteria?.slice(0, 5) || [],
      risks: parsed.risks?.slice(0, 4) || [],
    };
  } catch {
    return null;
  }
}
