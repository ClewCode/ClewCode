import { readFileSync } from 'fs';

const errorFile = process.argv[2];
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

const errs = {};
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!m) continue;
  const code = m[4];
  if (!errs[code]) errs[code] = [];
  errs[code].push(line);
}

console.log('=== TS2304 (Cannot find name) - all', errs['2304']?.length || 0);
(errs['2304']||[]).slice(0,40).forEach(e => console.log(e));
console.log('\n=== TS7006 - all', errs['7006']?.length || 0);
(errs['7006']||[]).slice(0,40).forEach(e => console.log(e));
console.log('\n=== TS7053 - all', errs['7053']?.length || 0);
(errs['7053']||[]).slice(0,40).forEach(e => console.log(e));
