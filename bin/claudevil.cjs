#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const mainJs = path.join(__dirname, '..', 'dist', 'main.js');
const userArgs = process.argv.slice(2).join(' ');

try {
  execSync(`bun "${mainJs}" ${userArgs}`, { stdio: 'inherit', shell: true });
} catch (e) {
  console.error("Error executing bun:", e.message || e);
  process.exit(e.status ?? 1);
}
