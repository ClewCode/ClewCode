import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEntry, extractChangelog, inferChangelogSection, validatePrBody } from './pr-changelog.mjs';

test('extracts changelog section without following headings', () => {
  const body = '## Changelog\n\nFix stale provider selection.\n\n## Testing\npass';
  assert.equal(extractChangelog(body), 'Fix stale provider selection.');
});

test('infers Added and Fixed from checked change type', () => {
  assert.equal(inferChangelogSection('* [x] New feature'), 'Added');
  assert.equal(inferChangelogSection('* [X] Bug fix'), 'Fixed');
  assert.equal(inferChangelogSection('* [x] Refactoring'), 'Changed');
});

test('rejects missing and skipped changelog entries', () => {
  assert.throws(() => validatePrBody('## Description\nfoo'), /must include/);
  assert.throws(() => validatePrBody('## Changelog\n\nskip'), /may not be skipped/);
});

test('applies one idempotent PR entry under Unreleased section', () => {
  const source = '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- Existing fix.\n\n## [1.0.0]\n';
  const args = {
    section: 'Fixed',
    entry: 'Fix stale provider selection.',
    prNumber: '42',
    prUrl: 'https://github.com/acme/repo/pull/42',
  };
  const once = applyEntry(source, args);
  const twice = applyEntry(once, args);
  assert.ok(once.includes('Fix stale provider selection. ([#42](https://github.com/acme/repo/pull/42))'));
  assert.equal(twice, once);
});