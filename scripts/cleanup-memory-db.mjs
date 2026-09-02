#!/usr/bin/env node
/**
 * Cleanup legacy SQLite memory DBs — filesystem is now SoT.
 *
 * Removes: .clew/memory/memory.db (+ wal/shm)
 *          .clew/index/chunks.db (+ wal/shm)
 *          .clew/index/vectors.db (+ wal/shm)
 *          legacy .claude/ equivalents
 *
 * Usage:
 *   node scripts/cleanup-memory-db.mjs --dry-run   # preview
 *   node scripts/cleanup-memory-db.mjs --force     # delete
 *   node scripts/cleanup-memory-db.mjs             # interactive prompt
 */

import { existsSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const DRY = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

const CANDIDATES = [
  // Taste (now filesystem, legacy SQLite)
  '.clew/taste/taste.db',
  '.clew/taste/taste.db-wal',
  '.clew/taste/taste.db-shm',
  '.claude/taste/taste.db',
  '.claude/taste/taste.db-wal',
  '.claude/taste/taste.db-shm',
  '.clew/memory/memory.db',
  '.clew/memory/memory.db-wal',
  '.clew/memory/memory.db-shm',
  '.clew/memory/timeline.db',
  '.clew/memory/timeline.db-wal',
  '.clew/memory/timeline.db-shm',
  '.clew/index/chunks.db',
  '.clew/index/chunks.db-wal',
  '.clew/index/chunks.db-shm',
  '.clew/index/vectors.db',
  '.clew/index/vectors.db-wal',
  '.clew/index/vectors.db-shm',
  // legacy .claude paths
  '.claude/memory/memory.db',
  '.claude/memory/memory.db-wal',
  '.claude/memory/memory.db-shm',
  '.claude/index/chunks.db',
  '.claude/index/chunks.db-wal',
  '.claude/index/chunks.db-shm',
];

function findTargets(cwd) {
  const found = [];
  for (const rel of CANDIDATES) {
    const abs = join(cwd, rel);
    if (existsSync(abs)) {
      try {
        const s = statSync(abs);
        found.push({ rel, abs, size: s.size });
      } catch { found.push({ rel, abs, size: 0 }); }
    }
  }
  return found;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, ans => {
      rl.close();
      resolve(/^y(es)?$/i.test(ans.trim()));
    });
  });
}

async function main() {
  const cwd = process.cwd();
  const targets = findTargets(cwd);

  if (targets.length === 0) {
    console.log('✓ No legacy SQLite DB files found. Already clean (filesystem SoT).');
    if (existsSync(join(cwd, '.clew/memory/store'))) {
      console.log('  store/: filesystem memories active');
    }
    if (existsSync(join(cwd, '.clew/memory/index.json'))) {
      console.log('  index.json: ephemeral cache present (gitignored, derived)');
    }
    return;
  }

  const total = targets.reduce((a, t) => a + t.size, 0);
  console.log(`Found ${targets.length} legacy SQLite artifact(s):`);
  for (const t of targets) {
    console.log(`  - ${t.rel} (${(t.size / 1024).toFixed(1)} KB)`);
  }
  console.log(`  Total: ${(total / 1024).toFixed(1)} KB`);
  console.log('');
  console.log('Filesystem is now Source of Truth (.clew/memory/store/*.md + index.json cache).');
  console.log('These DB files are derived caches and safe to delete.');
  console.log('');

  if (DRY) {
    console.log('[dry-run] No files deleted. Run with --force to delete.');
    return;
  }

  let ok = FORCE;
  if (!FORCE) {
    ok = await confirm('Delete these files? [y/N] ');
  }
  if (!ok) {
    console.log('Aborted. Run with --force to skip prompt.');
    return;
  }

  let deleted = 0;
  for (const t of targets) {
    try {
      unlinkSync(t.abs);
      console.log(`  deleted ${t.rel}`);
      deleted++;
    } catch (e) {
      console.error(`  failed ${t.rel}: ${e.message}`);
    }
  }
  console.log(`\n✓ Deleted ${deleted}/${targets.length} files.`);
  console.log('Note: .clew/memory/index.json is ephemeral cache (derived) — will be regenerated on next memory access.');
}

main().catch(e => { console.error(e); process.exit(1); });
