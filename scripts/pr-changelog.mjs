#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const SECTION_ORDER = ['Added', 'Changed', 'Fixed', 'Removed'];

export function extractChangelog(body = '') {
  const match = body.match(/^## Changelog\s*\r?\n([\s\S]*?)(?=^##\s|\s*$)/m);
  if (!match) return '';
  return match[1].replace(/<!--([\s\S]*?)-->/g, '').trim();
}

export function inferChangelogSection(body = '') {
  const checked = [...body.matchAll(/^\* \[[xX]\] (.+)$/gm)].map(match => match[1].trim().toLowerCase());
  if (checked.some(value => value === 'new feature')) return 'Added';
  if (checked.some(value => value === 'bug fix')) return 'Fixed';
  if (checked.some(value => value === 'other') && /remov|delet|deprecat/i.test(body)) return 'Removed';
  return 'Changed';
}

export function normalizeEntry(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*]\s+/, ''))
    .join(' ')
    .trim();
}

export function validatePrBody(body) {
  const entry = normalizeEntry(extractChangelog(body));
  if (!entry) throw new Error('PR body must include a non-empty ## Changelog section.');
  if (/^(n\/?a|none|skip|no changelog)$/i.test(entry)) {
    throw new Error('Changelog may not be skipped. Describe the user/developer-visible change in ## Changelog.');
  }
  if (entry.length < 12) throw new Error('Changelog entry is too short; write a useful one-sentence summary.');
  return entry;
}

export function applyEntry(changelog, { section, entry, prNumber, prUrl }) {
  if (!SECTION_ORDER.includes(section)) throw new Error(`Unsupported changelog section: ${section}`);
  const suffix = prNumber ? ` ([#${prNumber}](${prUrl || '#' + prNumber}))` : '';
  const line = `- ${entry}${suffix}`;
  if (changelog.includes(line)) return changelog;

  const unreleasedIndex = changelog.indexOf('## [Unreleased]');
  if (unreleasedIndex < 0) throw new Error('CHANGELOG.md has no ## [Unreleased] section.');

  const sectionHeading = `### ${section}`;
  const sectionIndex = changelog.indexOf(sectionHeading, unreleasedIndex);
  const nextRelease = changelog.indexOf('\n## [', unreleasedIndex + 1);

  if (sectionIndex >= 0 && (nextRelease < 0 || sectionIndex < nextRelease)) {
    const insertAt = changelog.indexOf('\n', sectionIndex + sectionHeading.length) + 1;
    return changelog.slice(0, insertAt) + '\n' + line + '\n' + changelog.slice(insertAt);
  }

  const insertAt = changelog.indexOf('\n', unreleasedIndex) + 1;
  return changelog.slice(0, insertAt) + `\n${sectionHeading}\n\n${line}\n` + changelog.slice(insertAt);
}

function main() {
  const command = process.argv[2];
  const body = process.env.PR_BODY || '';
  if (command === 'validate') {
    console.log(`Changelog OK: ${validatePrBody(body)}`);
    return;
  }
  if (command === 'apply') {
    const entry = validatePrBody(body);
    const section = process.env.CHANGELOG_SECTION || inferChangelogSection(body);
    const path = process.env.CHANGELOG_PATH || 'CHANGELOG.md';
    const updated = applyEntry(readFileSync(path, 'utf8'), {
      section,
      entry,
      prNumber: process.env.PR_NUMBER,
      prUrl: process.env.PR_URL,
    });
    writeFileSync(path, updated, 'utf8');
    console.log(`Added PR #${process.env.PR_NUMBER ?? '?'} to CHANGELOG.md under ${section}.`);
    return;
  }
  throw new Error('Usage: node scripts/pr-changelog.mjs <validate|apply>');
}

const invokedPath = process.argv[1] ? new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href : '';
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}