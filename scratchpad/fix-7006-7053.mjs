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
  const [, file, lineStr, colStr, codeStr, msg] = m;
  if (!errorsByFile[file]) errorsByFile[file] = [];
  errorsByFile[file].push({ line: parseInt(lineStr), col: parseInt(colStr), code: parseInt(codeStr), msg });
}

let totalIgnored = 0;
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

  // Collect line numbers for TS7006 and TS7053
  const linesToAnnotate = new Set();

  for (const err of errs) {
    if (err.code !== 7006 && err.code !== 7053) continue;

    const idx = err.line - 1;
    if (idx < 0 || idx >= srcLines.length) continue;

    // For TS7006 (implicit any param), try to add :any to the param first
    if (err.code === 7006) {
      const paramMatch = err.msg.match(/Parameter '(.+?)' implicitly has an 'any' type/);
      if (paramMatch) {
        const paramName = paramMatch[1];
        const srcLine = srcLines[idx];
        const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Try to find paramName followed by ) or , or =>
        const re = new RegExp(`(\\b${escaped}\\b)(\\s*[,)=>])`);
        const newLine = srcLine.replace(re, paramName + ': any$2');
        if (newLine !== srcLine) {
          srcLines[idx] = newLine;
          continue; // Successfully added :any, no need for @ts-ignore
        }
      }
    }

    // For TS7053 or if :any didn't work, add @ts-ignore
    const prevIdx = idx - 1;
    if (prevIdx >= 0) {
      const prevLine = srcLines[prevIdx].trim();
      if (prevLine.startsWith('// @ts-ignore')) continue;
      if (prevLine.startsWith('// @ts-expect-error')) continue;
    }
    linesToAnnotate.add(idx);
  }

  const sorted = [...linesToAnnotate].sort((a, b) => b - a);
  for (const idx of sorted) {
    srcLines.splice(idx, 0, '// @ts-ignore');
    totalIgnored++;
  }

  const newSrc = srcLines.join('\n');
  if (newSrc !== src) {
    writeFileSync(fullPath, newSrc, 'utf8');
    totalModified++;
  }
}

console.log(`Added ${totalIgnored} @ts-ignore across ${totalModified} files`);
