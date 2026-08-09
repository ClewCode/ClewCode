import { readFileSync } from 'fs';

const errorFile = process.argv[2];
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

const groups = {};
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS(\d+): (.+)/);
  if (!m) continue;
  if (!groups[m[4]]) groups[m[4]] = [];
  groups[m[4]].push(m[0]);
}

for (const code of Object.keys(groups).sort()) {
  console.log(`\n=== TS${code} (${groups[code].length}) ===`);
  for (const e of groups[code]) {
    console.log(e);
  }
}
