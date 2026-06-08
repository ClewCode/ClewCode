/**
 * Terminal UI helpers for research pipeline output.
 * Uses ANSI escape codes for color and Unicode box-drawing for structure.
 * No emoji — clean ASCII/Unicode symbols only.
 */

export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
};

export function researchHeader(query: string, mode: string): string {
  return [
    `${C.bold}${C.cyan}╭── Research Pipeline ${C.reset}`,
    `${C.bold}${C.cyan}│${C.reset}  ${C.white}Query:${C.reset} ${query}`,
    `${C.bold}${C.cyan}│${C.reset}  ${C.white}Mode:${C.reset}  ${mode}`,
    `${C.bold}${C.cyan}╰${'─'.repeat(40)}${C.reset}`,
  ].join('\n');
}

export function stepStart(label: string): string {
  return `${C.yellow}\u25CB ${label}${C.dim}...${C.reset}`;
}

export function stepDone(label: string, detail: string): string {
  return `${C.green}\u25C9 ${label}${C.reset} ${C.dim}\u2014 ${detail}${C.reset}`;
}

export function counter(label: string, count: number): string {
  return `${C.dim}\u2022${C.reset} ${label}: ${C.bold}${count}${C.reset}`;
}

export function sourceLine(index: number, title: string, type: string, trust: string): string {
  const trustColor = trust === 'high' ? C.green : trust === 'low' ? C.red : C.yellow;
  return `  ${C.dim}${index}.${C.reset} ${title.slice(0, 50)} ${C.dim}[${type}]${C.reset} ${trustColor}${trust}${C.reset}`;
}

export function claimLine(index: number, text: string, confidence: string): string {
  const confColor = confidence === 'high' ? C.green : confidence === 'low' ? C.yellow : C.dim;
  return `  ${C.dim}${index}.${C.reset} ${confColor}${confidence}${C.reset} ${text.slice(0, 80)}`;
}

export function synthesisBox(synthesis: {
  overallConfidence: string;
  summary: string;
  consensusCount: number;
  conflictCount: number;
  gapCount: number;
}): string {
  const confColor =
    synthesis.overallConfidence === 'high'
      ? C.green
      : synthesis.overallConfidence === 'low'
        ? C.yellow
        : C.cyan;
  return [
    `${C.bold}${C.magenta}╭── Synthesis${C.reset}`,
    `${C.bold}${C.magenta}│${C.reset}  ${confColor}${synthesis.overallConfidence.toUpperCase()}${C.reset} confidence`,
    `${C.bold}${C.magenta}│${C.reset}  ${C.green}${synthesis.consensusCount} consensus${C.reset}  ${C.yellow}${synthesis.conflictCount} conflicts${C.reset}  ${C.dim}${synthesis.gapCount} gaps${C.reset}`,
    `${C.bold}${C.magenta}│${C.reset}  ${synthesis.summary.slice(0, 100)}`,
    `${C.bold}${C.magenta}╰${'─'.repeat(40)}${C.reset}`,
  ].join('\n');
}

export function summaryFooter(runId: string, sources: number, claims: number, citations: number): string {
  return [
    `${C.bold}${C.green}╭── Run Complete${C.reset}`,
    `${C.bold}${C.green}│${C.reset}  ID: ${C.dim}${runId}${C.reset}`,
    `${C.bold}${C.green}│${C.reset}  ${counter('Sources', sources)}  ${counter('Claims', claims)}  ${counter('Citations', citations)}`,
    `${C.bold}${C.green}╰${'─'.repeat(40)}${C.reset}`,
  ].join('\n');
}
