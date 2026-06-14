/**
 * Normalize HTML structure: replace inline headers with JS-injected pattern.
 */
import fs from 'node:fs';
import path from 'node:path';

const files = [
  'docs/features/swarm.html',
  'docs/internals/hidden-features.html',
  'docs/internals/hidden-features.th.html',
];

for (const filePath of files) {
  if (!fs.existsSync(filePath)) {
    console.log('SKIP:', filePath);
    continue;
  }

  let c = fs.readFileSync(filePath, 'utf-8');

  // Remove inline header (full block between <header class="header"> and </header>)
  c = c.replace(/<header class="header">[\s\S]*?<\/header>\n?/,
    '<header class="header"></header>\n');

  // Determine relative JS path
  const dir = path.dirname(filePath);
  const isSub = dir.includes('features') || dir.includes('internals');
  const jsPath = isSub ? '../js/main.js' : 'js/main.js';

  // Add script if missing
  if (!c.includes('main.js')) {
    c = c.replace('</body>', `<script src="${jsPath}"></script>\n</body>`);
  }

  fs.writeFileSync(filePath, c, 'utf-8');
  console.log('Fixed:', filePath);
}
