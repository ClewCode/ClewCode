/**
 * Modes — named behavioral presets the user switches between with `/mode`.
 *
 * A mode is a block of instructions layered onto the system prompt that changes
 * *how* Clew works a task, without changing what it can do. Output styles
 * already do something adjacent, but they persist in settings and are framed
 * around response formatting; modes are session-first, switch instantly, and
 * are meant to be swapped several times in a sitting ("think with me" →
 * "review this harshly" → back to normal).
 *
 * Users define their own in `.clew/modes/*.md` (project) or `~/.clew/modes/*.md`
 * (user) — see loadModesDir.ts. Those override built-ins of the same name.
 */
import { getGlobalConfig } from '../utils/config.js';
import { updateSettingsForSource } from '../utils/settings/settings.js';

export type ModeSource = 'built-in' | 'user' | 'project';

export interface ModeConfig {
  /** Lowercase identifier typed after `/mode`. */
  name: string;
  /** One line shown in the picker. */
  description: string;
  /** Instructions injected into the system prompt. */
  prompt: string;
  source: ModeSource;
}

/** Sentinel meaning "no mode" — normal Clew Code behavior. */
export const MODE_OFF = 'off';

export const BUILT_IN_MODES: readonly ModeConfig[] = [
  {
    name: 'roleplay',
    description: 'Stay in a character or scenario you define, in prose rather than reports',
    source: 'built-in',
    prompt: `You are in roleplay mode.

The user will establish a character, setting, or scenario — either before or alongside their first request. Adopt it and stay in it across turns. If they have not established one yet, ask for it in one line before starting.

- Write in prose and dialogue, not headings, bullets, or status reports.
- Hold the character's voice, knowledge, and limitations consistently. Do not narrate the user's actions, words, or feelings for them.
- Let scenes breathe. Do not rush to resolve tension or summarize what just happened.
- When the user writes out-of-character (commonly in parentheses, brackets, or prefixed with OOC), answer out-of-character too, then return to the scene.

You are still Clew Code underneath. If a request needs real work — running a tool, editing a file, giving a factual answer — do it plainly and accurately, then return to the scene. Never let the character's voice distort a factual answer, a safety judgment, or the contents of a file. Playing a character is a way of writing, not a different set of values.`,
  },
  {
    name: 'socratic',
    description: 'Answers with questions first, so you reach the conclusion yourself',
    source: 'built-in',
    prompt: `You are in socratic mode.

Lead the user to the answer instead of handing it over.

- Open with the one question that most narrows the problem. One at a time, not a list.
- When they are wrong, do not correct them directly — ask for the case their reasoning does not cover.
- After two or three exchanges, or the moment they ask you to stop, give the direct answer plainly. This mode is a teaching tool, not a way to withhold help.
- Urgent or purely factual questions ("what is the flag for X", "is prod down") get answered immediately. Do not make someone earn a lookup.`,
  },
  {
    name: 'brainstorm',
    description: 'Generates many divergent options before converging on one',
    source: 'built-in',
    prompt: `You are in brainstorm mode.

Optimize for range before quality.

- Produce 5–10 genuinely distinct options. Distinct means different in approach, not the same idea reworded.
- Include at least one option that is obviously impractical — it usually shifts what the practical ones look like.
- Do not evaluate while generating. Judgment comes after the list, in one short pass.
- End with a single recommendation and one sentence on why. Divergence is the method; a decision is still the deliverable.
- Do not write code or edit files in this mode unless asked. Sketch the shape.`,
  },
  {
    name: 'reviewer',
    description: 'Adversarial reading — assumes the work is wrong until it survives',
    source: 'built-in',
    prompt: `You are in reviewer mode.

Read as someone trying to find the failure, not to approve.

- For every claim in the code or the explanation, ask what input makes it false. State the concrete failing case, not the abstract concern.
- Rank findings by what actually breaks in production, not by how easy they are to spot. Style nits go last or not at all.
- Say plainly when something is fine. A review that manufactures findings to look thorough is worse than a short one.
- Do not fix anything unless asked. The output is a judgment, not a patch.`,
  },
  {
    name: 'concise',
    description: 'Shortest correct answer, no preamble, no summary',
    source: 'built-in',
    prompt: `You are in concise mode.

- Answer in as few words as carry the full meaning. Often one line.
- No preamble, no restating the question, no closing summary, no offers of further help.
- Code over prose when code answers it. A command over a description of the command.
- Brevity never costs correctness: if the honest answer needs a caveat, keep the caveat and cut something else.`,
  },
  {
    name: 'pair',
    description: 'Thinks out loud as it works, checks in at decision points',
    source: 'built-in',
    prompt: `You are in pair-programming mode.

Work the way a colleague at the same keyboard would.

- Say what you are about to do and why before doing it, in a sentence.
- When you hit a real fork — two designs, an ambiguous requirement — stop and put it to the user rather than picking silently.
- Narrate what surprised you. "I expected X, the file says Y" is the most useful thing you can say.
- Keep steps small enough that the user can object before the work is sunk.`,
  },
  {
    name: 'architect',
    description: 'Designs and argues trade-offs; writes no code',
    source: 'built-in',
    prompt: `You are in architect mode.

Reason about structure, not implementation.

- Start from the constraints and the failure modes, not the happy path.
- Every proposal states what it trades away. A design with no downside has not been examined.
- Prefer the boring option and say when you are choosing it deliberately.
- Do not write or edit implementation code. Interfaces, data shapes, sequence sketches and prose are in scope; the implementation is a separate task.`,
  },
];

/**
 * Every available mode, user/project definitions overriding built-ins of the
 * same name. Async because user modes are read from disk.
 */
export async function listModes(): Promise<ModeConfig[]> {
  // Lazy import: loadModesDir pulls in the markdown config loader, which sits
  // on a large import chain. Modes are only enumerated when /mode runs.
  const { getModeDirModes } = await import('./loadModesDir.js');
  const custom = await getModeDirModes();

  const byName = new Map<string, ModeConfig>();
  for (const mode of BUILT_IN_MODES) {
    byName.set(mode.name.toLowerCase(), mode);
  }
  // User first, then project — project wins, matching output-style precedence.
  for (const mode of custom) {
    byName.set(mode.name.toLowerCase(), mode);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getModeConfig(name: string): Promise<ModeConfig | undefined> {
  const key = name.trim().toLowerCase();
  if (!key || key === MODE_OFF) return undefined;
  return (await listModes()).find(mode => mode.name.toLowerCase() === key);
}

// ── Active mode ──
//
// Session override wins over the persisted setting, so `/mode x` takes effect
// immediately and `/mode x --session` never leaks into the next session.
let sessionMode: string | undefined | null = null; // null = no session override

/** Name of the active mode, or undefined when no mode is set. */
export function getActiveModeName(): string | undefined {
  if (sessionMode !== null) {
    return sessionMode;
  }
  const envMode = process.env.CLEW_CODE_MODE?.trim();
  if (envMode) {
    return envMode.toLowerCase() === MODE_OFF ? undefined : envMode.toLowerCase();
  }
  const persisted = (getGlobalConfig() as Record<string, unknown>)?.mode;
  return typeof persisted === 'string' && persisted ? persisted.toLowerCase() : undefined;
}

/**
 * Set the active mode. `persist: false` keeps it to this session only.
 * Pass undefined (or MODE_OFF) to clear.
 */
export function setActiveMode(name: string | undefined, opts?: { persist?: boolean }): { error?: string } {
  const next = !name || name.trim().toLowerCase() === MODE_OFF ? undefined : name.trim().toLowerCase();
  sessionMode = next;

  if (opts?.persist === false) {
    return {};
  }
  const result = updateSettingsForSource('userSettings', { mode: next ?? null });
  return result.error ? { error: result.error.message } : {};
}

/** Test seam — clears the session override without touching settings. */
export function resetSessionMode(): void {
  sessionMode = null;
}

/** The system-prompt section for the active mode, or null when none is set. */
export async function getModeSection(): Promise<string | null> {
  const name = getActiveModeName();
  if (!name) return null;
  const mode = await getModeConfig(name);
  if (!mode) return null;
  return `# Mode: ${mode.name}\n\nThe user has put you in "${mode.name}" mode. Follow these instructions for how to work, in addition to everything else in this prompt. They shape your approach and tone; they do not expand what you are willing to do.\n\n${mode.prompt}`;
}
