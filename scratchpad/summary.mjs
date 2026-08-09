import { readFileSync } from 'fs';
import { resolve } from 'path';

const errorFile = process.argv[2];
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

const codes = {};
const files = {};
let total = 0;

for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!m) continue;
  total++;
  const code = m[4];
  const file = m[1];
  codes[code] = (codes[code] || 0) + 1;
  files[file] = (files[file] || 0) + 1;
}

console.log('Total:', total);
console.log('\nBy code:');
const sorted = Object.entries(codes).sort((a, b) => b[1] - a[1]);
for (const [code, count] of sorted) {
  console.log(`  TS${code}: ${count}`);
}

console.log('\nTop 20 files:');
const sortedFiles = Object.entries(files).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [f, c] of sortedFiles) console.log(`  ${c} ${f}`);
