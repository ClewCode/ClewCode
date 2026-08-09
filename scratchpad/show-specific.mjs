import { readFileSync } from 'fs';

const errorFile = process.argv[2];
const content = readFileSync(errorFile, 'utf8');
const lines = content.split('\n');

console.log('=== TS2304 ===');
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS2304: (.+)/);
  if (!m) continue;
  console.log(m[0]);
}

console.log('\n=== TS2305 (missing exports) ===');
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS2305: (.+)/);
  if (!m) continue;
  console.log(m[0]);
}

console.log('\n=== TS2614 ===');
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS2614: (.+)/);
  if (!m) continue;
  console.log(m[0]);
}

console.log('\n=== TS2578 ===');
for (const line of lines) {
  const m = line.match(/^(.+?)\((\d+),(\d+)\): error TS2578: (.+)/);
  if (!m) continue;
  console.log(m[0]);
}
