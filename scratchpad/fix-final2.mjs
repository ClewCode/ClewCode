import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const errorFile = process.argv[2];
const projectRoot = process.argv[3] || '.';
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

const errorsByFile = {};
const allErrors = [];
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!m) continue;
  const [, file, lineStr, colStr, codeStr, msg] = m;
  const code = parseInt(codeStr);
  const cleanFile = file.replace(/^\uFEFF/, '');
  if (!errorsByFile[cleanFile]) errorsByFile[cleanFile] = [];
  errorsByFile[cleanFile].push({
    line: parseInt(lineStr),
    col: parseInt(colStr),
    code,
    msg,
  });
  allErrors.push({ file: cleanFile, line: parseInt(lineStr), col: parseInt(colStr), code, msg });
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
  const linesToAnnotate = new Set();
  let modified = false;

  for (const err of errs) {
    const idx = err.line - 1; // 0-indexed
    if (idx < 0 || idx >= srcLines.length) continue;

    // Skip if already has annotation above
    const prevIdx = idx - 1;
    if (prevIdx >= 0) {
      const prevLine = srcLines[prevIdx].trim();
      if (prevLine.startsWith('// @ts-ignore') || prevLine.startsWith('// @ts-expect-error')) continue;
    }

    if (err.code === 7006) {
      // Implicit any parameter - add ': any'
      const paramMatch = err.msg.match(/Parameter '(.+?)' implicitly has an 'any' type/);
      if (paramMatch) {
        const paramName = paramMatch[1];
        const srcLine = srcLines[idx];
        const escaped = paramName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(\\b${escaped}\\b)(\\s*[,)=>])`);
        const newLine = srcLine.replace(re, paramName + ': any$2');
        if (newLine !== srcLine) {
          srcLines[idx] = newLine;
          modified = true;
          continue;
        }
      }
      // Fallback to @ts-ignore
      linesToAnnotate.add(idx);
    } else if (err.code === 2367) {
      // Comparison error - try to add as string cast
      const srcLine = srcLines[idx];
      let newLine = srcLine;

      // Pattern: 'external' === 'ant' → ('external' as string) === 'ant'
      newLine = newLine.replace(/'external' === 'ant'/, "('external' as string) === 'ant'");

      // Pattern: xxx.type === 'something' → (xxx.type as string) === 'something'
      if (newLine === srcLine) {
        // More general: cast the left operand of === to string
        newLine = newLine.replace(
          /(\w+(?:\.\w+)*)\.type === ('[^']+')/,
          '($1.type as string) === $2'
        );
      }

      if (newLine !== srcLine) {
        srcLines[idx] = newLine;
        modified = true;
        continue;
      }
      linesToAnnotate.add(idx);
    } else if (err.code === 18047 || err.code === 18048) {
      // Possibly null/undefined - add '@' non-null assertion
      const srcLine = srcLines[idx];
      // Try to add ! after the variable
      const varMatch = err.msg.match(/'(.+?)' is (?:possibly 'null'|possibly 'undefined')/);
      if (varMatch) {
        const varName = varMatch[1];
        const escaped = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Add ! at the end of property access or variable
        const re = new RegExp(`(${escaped}(\\.\\w+)+|${escaped})\\b(?!['"\\s]*[?:.])`, 'g');
        const newLine = srcLine.replace(re, '$1!');
        if (newLine !== srcLine) {
          srcLines[idx] = newLine;
          modified = true;
          continue;
        }
      }
      linesToAnnotate.add(idx);
    } else {
      // All other errors - add @ts-ignore
      linesToAnnotate.add(idx);
    }
  }

  // Add @ts-ignore (reverse order)
  const sortedAnns = [...linesToAnnotate].sort((a, b) => b - a);
  for (const idx of sortedAnns) {
    srcLines.splice(idx, 0, '// @ts-ignore');
    modified = true;
  }

  if (modified) {
    writeFileSync(fullPath, srcLines.join('\n'), 'utf8');
    totalModified++;
  }
}

console.log(`Modified ${totalModified} files`);
