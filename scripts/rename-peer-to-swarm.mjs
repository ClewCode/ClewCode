/**
 * Bulk rename: peer -> swarm across all source files
 */
import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
        results.push(...walk(full));
      }
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

// Only replace import paths — safe, targeted changes
const replacements = [
  // Import paths for peer/ directory
  [/from ['"]\.\.\/peer\//g, `from '../swarm/`],
  [/from ['"]\.\/peer\//g, `from './swarm/`],
  [/from ['"]\.\.\/\.\.\/peer\//g, `from '../../swarm/`],
  [/from ['"]\.\.\/\.\.\/\.\.\/peer\//g, `from '../../../swarm/`],

  // Import paths for tools/Peer* -> tools/Swarm*
  [/from ['"]\.\.\/\.\.\/tools\/PeerInfoTool\//g, `from '../../tools/SwarmInfoTool/`],
  [/from ['"]\.\.\/tools\/PeerInfoTool\//g, `from '../tools/SwarmInfoTool/`],
  [/from ['"]\.\/PeerInfoTool\//g, `from './SwarmInfoTool/`],
  [/from ['"]\.\.\/\.\.\/tools\/PeerHelpTool\//g, `from '../../tools/SwarmHelpTool/`],
  [/from ['"]\.\.\/tools\/PeerHelpTool\//g, `from '../tools/SwarmHelpTool/`],
  [/from ['"]\.\/PeerHelpTool\//g, `from './SwarmHelpTool/`],
  [/from ['"]\.\.\/peer\//g, `from '../swarm/`],
];

const srcDir = 'src';
const files = walk(srcDir);
let totalChanged = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf-8');
    totalChanged++;
    console.log('Updated:', file);
  }
}

console.log(`\nTotal files updated: ${totalChanged}`);
