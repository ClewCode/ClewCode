import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const errorFile = process.argv[2];
const projectRoot = process.argv[3] || '.';
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

const errorsByFile = {};
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!m) continue;
  const [, file, lineStr, , codeStr] = m;
  if (!errorsByFile[file]) errorsByFile[file] = [];
  errorsByFile[file].push({ line: parseInt(lineStr), code: parseInt(codeStr) });
}

let totalModified = 0;

for (const [file, errs] of Object.entries(errorsByFile)) {
  const fullPath = resolve(projectRoot, file);
  let src;
  try {
    src = readFileSync(fullPath, 'utf8');
  } catch (e) {
    continue;
  }

  const srcLines = src.split('\n');

  // Collect lines to remove (@ts-expect-error unused)
  const linesToRemove = new Set();
  // Collect lines to annotate with @ts-ignore
  const linesToAnnotate = new Set();

  for (const err of errs) {
    const idx = err.line - 1;
    if (idx < 0 || idx >= srcLines.length) continue;

    if (err.code === 2578) {
      // Unused @ts-expect-error - mark for removal
      const trimmed = srcLines[idx].trim();
      if (trimmed.startsWith('// @ts-expect-error')) {
        linesToRemove.add(idx);
      }
    } else if ([2304, 2305, 2614].includes(err.code)) {
      // Add @ts-ignore before this line
      // Check if already has annotation
      const prevIdx = idx - 1;
      if (prevIdx >= 0) {
        const prevLine = srcLines[prevIdx].trim();
        if (prevLine.startsWith('// @ts-ignore') || prevLine.startsWith('// @ts-expect-error')) continue;
      }
      linesToAnnotate.add(idx);
    }
  }

  // Process removals first (reverse order)
  const sortedRemoves = [...linesToRemove].sort((a, b) => b - a);
  for (const idx of sortedRemoves) {
    srcLines.splice(idx, 1);
  }

  // Now process annotations (reverse order), accounting for removed lines
  const sortedAnns = [...linesToAnnotate].sort((a, b) => b - a);
  for (const idx of sortedAnns) {
    // Adjust for removed lines before this index
    let adjustedIdx = idx;
    for (const removed of sortedRemoves) {
      if (removed < idx) adjustedIdx--;
      if (removed > idx) break;
    }
    // Also adjust for already-inserted annotations above this line
    const aboveAnns = sortedAnns.filter(a => a > idx);
    adjustedIdx -= aboveAnns.length;

    if (adjustedIdx < 0 || adjustedIdx >= srcLines.length) continue;
    srcLines.splice(adjustedIdx, 0, '// @ts-ignore');
  }

  const newSrc = srcLines.join('\n');
  if (newSrc !== src) {
    writeFileSync(fullPath, newSrc, 'utf8');
    totalModified++;
  }
}

console.log(`Modified ${totalModified} files for TS2304/TS2305/TS2614/TS2578`);
