/**
 * Fix mojibake encoding in all docs HTML files.
 *
 * Problem: Files were double-encoded — original UTF-8 bytes were
 * misinterpreted as CP1252 then re-encoded as UTF-8, producing
 * characters like â€” instead of — and à¸„ instead of ค.
 *
 * This script reverses the damage by mapping each Unicode char
 * back to its CP1252 byte and re-decoding as UTF-8.
 * Legitimate Unicode characters (Thai, arrows, emoji) pass through.
 */
import fs from 'node:fs';
import path from 'node:path';

const cp1252 = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

function fixMojibake(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM

  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0xff) {
      bytes.push(code);
    } else if (cp1252.has(code)) {
      bytes.push(cp1252.get(code));
    } else {
      const buf = Buffer.from(text[i], 'utf-8');
      for (const b of buf) bytes.push(b);
    }
  }
  return Buffer.from(bytes).toString('utf-8');
}

// Walk docs/ recursively
function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const entry of list) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const files = walk('docs');
let changed = 0;
let errors = 0;

for (const f of files) {
  try {
    const content = fs.readFileSync(f, 'utf-8');
    const fixed = fixMojibake(content);

    // skip if no change
    if (fixed === content) {
      console.log(`  ✓  ${f} — already clean`);
      continue;
    }

    fs.writeFileSync(f, fixed, 'utf-8');
    console.log(`  ✔  ${f}`);
    changed++;
  } catch (err) {
    console.error(`  ✘  ${f}: ${err.message}`);
    errors++;
  }
}

console.log(`\nDone: ${changed} files fixed, ${errors} errors`);
