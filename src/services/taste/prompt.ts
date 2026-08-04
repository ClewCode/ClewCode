/**
 * The taste section bolted onto the memory-extraction prompt, plus the parser
 * for what comes back.
 *
 * Taste rides along on the extraction fork rather than getting its own pass:
 * that fork already has the turn's messages in a prompt-cache-shared context,
 * so the marginal cost of asking one more question of it is a few hundred
 * tokens instead of a whole extra fork.
 *
 * The agent reports taste as a fenced block in its final text rather than by
 * writing the file itself. The extraction fork's write allowlist covers only
 * the auto-memory directory, and neither taste file lives there — routing the
 * write back through the host also means the host, not the model, decides the
 * final line format and dedupe.
 */

import type { TasteCategory, TasteScope } from './store.js';
import { DEFAULT_TASTE_CATEGORY, TASTE_CATEGORIES } from './store.js';

export type TasteCandidate = {
  scope: TasteScope;
  category: TasteCategory;
  confidence: number;
  text: string;
};

const FENCE = 'taste';

export function buildTastePromptSection(existingTaste: string[]): readonly string[] {
  const existing =
    existingTaste.length > 0
      ? ['', 'Already known — do not repeat these:', ...existingTaste.map(t => `- ${t}`)]
      : ['', 'Nothing has been learned yet.'];

  return [
    '',
    '## Taste',
    '',
    'Separately from memory, watch for *taste*: a standing preference in how the user wants you to respond. Memory records what you know about the user; taste records how you should behave. Taste is injected into every future turn, so the bar is high — only record a preference you would want to follow unprompted for the rest of time.',
    '',
    'Record taste when you observe a **repeated or explicitly stated** preference about:',
    '- the language, tone, or length the user wants replies in',
    '- the shape of your output (summaries, diffs, code-first vs explanation-first)',
    '- how much to ask versus decide on your own',
    '- conventions you are expected to follow without being reminded',
    '',
    'Bucket each preference into a **category** so it is filed alongside similar ones:',
    '- `cli` — command naming, argument style, flag conventions, output formatting',
    '- `typescript` — type choices, lint rules, import style, tsconfig preferences',
    '- `architecture` — module layout, dependency direction, service boundaries',
    '- `general` — everything else (language, tone, response shape)',
    '',
    'Do NOT record taste for:',
    '- one-off instructions scoped to the current task ("make this one shorter")',
    '- anything already in the list below',
    '- facts about the user — those are `user` memories',
    '- guidance with a stated reason — that is a `feedback` memory, which keeps the why',
    ...existing,
    '',
    '### Reporting taste',
    '',
    `End your final message with a \`${FENCE}\` fenced block. One preference per line, four fields separated by \`|\`:`,
    '',
    `\`\`\`${FENCE}`,
    'global|0.8|general|Communicates in Thai for brief messages and reactions',
    'project|0.6|architecture|Wants the full CI gate run before any push',
    'project|0.9|typescript|Uses const instead of let for non-reassigned variables',
    '```',
    '',
    '- **scope** — `global` for things true of this user everywhere (language, tone, response shape); `project` for conventions that belong to this repo only.',
    '- **category** — `cli`, `typescript`, `architecture`, or `general`.',
    '- **confidence** — 0.0–1.0. Use 0.5–0.7 for a pattern you inferred from behavior, 0.8–0.9 for something stated once explicitly, 1.0 only for a preference the user stated as a standing rule.',
    '- **text** — one sentence, present tense, describing the preference. Include a brief example in parentheses when the preference is about wording.',
    '',
    'Omit the block entirely if you observed nothing that clears the bar. That is the normal case — most turns teach you nothing about taste.',
  ];
}

/**
 * Pulls the taste block out of the agent's final text. Anything malformed is
 * dropped rather than guessed at: a bad line here would become a standing
 * instruction on every future turn.
 */
export function parseTasteBlock(text: string): TasteCandidate[] {
  const fence = new RegExp(`\`\`\`${FENCE}\\s*\\n([\\s\\S]*?)\`\`\``, 'g');
  const candidates: TasteCandidate[] = [];

  for (const match of text.matchAll(fence)) {
    const body = match[1];
    if (!body) continue;
    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split('|');
      if (parts.length < 3) continue;

      const scope = parts[0]?.trim();
      if (scope !== 'global' && scope !== 'project') continue;

      const secondField = parts[1]?.trim();
      const isCategory = TASTE_CATEGORIES.includes(secondField as TasteCategory);
      let category: TasteCategory;
      let confidenceNum: number;
      let entry: string;

      if (isCategory) {
        // New format: scope|category|confidence|text
        category = secondField as TasteCategory;
        confidenceNum = Number(parts[2]?.trim());
        entry = parts.slice(3).join('|').trim();
      } else {
        // Backward-compatible old format: scope|confidence|text
        category = DEFAULT_TASTE_CATEGORY;
        confidenceNum = Number(secondField);
        entry = parts.slice(2).join('|').trim();
      }

      if (!Number.isFinite(confidenceNum) || confidenceNum <= 0 || confidenceNum > 1) continue;
      if (!entry) continue;
      candidates.push({ scope, category, confidence: confidenceNum, text: entry });
    }
  }
  return candidates;
}
