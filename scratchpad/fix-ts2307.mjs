import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';

const errorFile = process.argv[2];
const projectRoot = process.argv[3] || '.';

const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

// Extract TS2307 errors: file, line
const ts2307Errors = [];
for (const line of lines) {
  const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS2307:/);
  if (match) {
    ts2307Errors.push({ file: match[1], line: parseInt(match[2]) });
  }
}

// Group by file
const byFile = {};
for (const e of ts2307Errors) {
  if (!byFile[e.file]) byFile[e.file] = [];
  byFile[e.file].push(e.line);
}

let totalModified = 0;

for (const [filePath, errLines] of Object.entries(byFile)) {
  const fullPath = resolve(projectRoot, filePath);
  let src;
  try {
    src = readFileSync(fullPath, 'utf8');
  } catch (e) {
    console.log(`SKIP (not found): ${filePath}`);
    continue;
  }

  const srcLines = src.split('\n');

  // Sort line numbers in reverse to avoid offset shifts
  const sortedLines = [...new Set(errLines)].sort((a, b) => b - a);

  // For each error line, find the actual import/require/import() line
  // and add @ts-ignore before it
  const linesToAnnotate = new Set();

  for (const errLine of sortedLines) {
    // The error is at this 1-indexed line; convert to 0-indexed
    const idx = errLine - 1;
    if (idx < 0 || idx >= srcLines.length) continue;

    // Check if this line already has @ts-ignore above it
    const prevIdx = idx - 1;
    if (prevIdx >= 0 && srcLines[prevIdx].trim().startsWith('// @ts-ignore')) continue;
    if (prevIdx >= 0 && srcLines[prevIdx].trim().startsWith('// @ts-expect-error')) continue;

    linesToAnnotate.add(idx);
  }

  // Sort again and insert
  const sortedAnns = [...linesToAnnotate].sort((a, b) => b - a);
  for (const idx of sortedAnns) {
    srcLines.splice(idx, 0, '// @ts-ignore');
  }

  const newSrc = srcLines.join('\n');
  if (newSrc !== src) {
    writeFileSync(fullPath, newSrc, 'utf8');
    totalModified++;
    console.log(`MODIFIED: ${filePath} (${sortedAnns.length} @ts-ignore added)`);
  }
}

console.log(`\nTotal files modified: ${totalModified}`);
console.log(`Total TS2307 errors: ${ts2307Errors.length}`);
