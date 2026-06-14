/**
 * Normalize all HTML files to consistent structure:
 * - Empty header (JS-injected)
 * - main.js script at end of body
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(__dirname, '../docs');

function walk(dir) {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const entry of list) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results.push(...walk(full));
    else if (entry.endsWith('.html')) results.push(full);
  }
  return results;
}

function relativePath(from, to) {
  const rel = path.relative(path.dirname(from), to);
  return rel.startsWith('.') ? rel : './' + rel;
}

const files = walk(docsDir);
let fixed = 0;

for (const filePath of files) {
  let c = fs.readFileSync(filePath, 'utf-8');
  const name = path.basename(filePath);

  // Skip landing page (different structure by design)
  if (name === 'index.html' || name === 'index.th.html') continue;

  // Fix 1: Replace inline header with empty header
  if (!c.includes('<header class="header"></header>')) {
    c = c.replace(/<header class="header">[\s\S]*?<\/header>\s*/,
      '<header class="header"></header>\n');
  }

  // Fix 2: Add main.js if missing
  if (!c.includes('main.js')) {
    const jsRelPath = relativePath(filePath, path.join(docsDir, 'js/main.js'));
    c = c.replace('</body>', `<script src="${jsRelPath}"></script>\n</body>`);
  }

  // Fix 3: Ensure Google Fonts includes Noto Sans Thai for .th.html files
  if (name.endsWith('.th.html') && !c.includes('Noto+Sans+Thai')) {
    c = c.replace(
      /family=JetBrains\+Mono:[^"'&]+/,
      '$&, &family=Noto+Sans+Thai:wght@400;500;600;700'
    );
  }

  // Fix 4: Clean up old lang-wrap styles in features/internals
  c = c.replace(/<div class="lang-wrap">[\s\S]*?<\/div>\s*<\/div>\s*/, '');

  fs.writeFileSync(filePath, c, 'utf-8');
  fixed++;
}

console.log(`Normalized ${fixed} files`);
