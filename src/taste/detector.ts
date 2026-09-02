/**
 * Explicit preference language detector.
 * Heuristic — catches Thai/English preference statements.
 */

const EXPLICIT_PATTERNS: RegExp[] = [
  /อย่า.*(?:เขียน|ทำ|ใช้|เพิ่ม)/i,
  /ต่อไป.*(?:ให้|อย่า|ใช้|ทำ)/i,
  /ชอบ.*(?:ให้|แบบ|สั้น|กระชับ)/i,
  /อยากให้.*(?:ทำ|ใช้|เขียน)/i,
  /prefer .*?(?:over|instead)/i,
  /don't .*?(?:add|use|write)/i,
  /please (?:don't|use|keep|prefer)/i,
  /keep .*?(?:concise|minimal|short)/i,
  /avoid .*?(?:abstraction|broad)/i,
];

export function detectExplicitPreference(text: string): string | null {
  if (!text || text.length < 8) return null;
  const trimmed = text.trim();
  for (const re of EXPLICIT_PATTERNS) {
    if (re.test(trimmed)) return trimmed.slice(0, 200);
  }
  // Also catch /taste add style
  if (/^\/taste\s+add/i.test(trimmed)) {
    const m = trimmed.match(/^\/taste\s+add\s+(.+)/i);
    return m ? m[1].trim().slice(0, 200) : null;
  }
  return null;
}

export function categorizePreference(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('comment') || t.includes('คอมเมนต์')) return 'coding';
  if (t.includes('refactor') || t.includes('diff') || t.includes('abstraction')) return 'architecture';
  if (t.includes('test')) return 'testing';
  if (t.includes('response') || t.includes('ตอบ') || t.includes('concise') || t.includes('สั้น')) return 'workflow';
  if (t.includes('react') || t.includes('typescript') || t.includes('bun')) return 'language';
  return 'coding';
}
