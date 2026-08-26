import { describe, expect, test } from 'bun:test';
import { buildMainAgentActivityModel } from './MainAgentActivity.js';
import type { CatalogRecord } from './sessionCatalog/sessionCatalogState.js';
import type { CatalogSessionSummary, SessionCatalogSection } from './sessionCatalog/types.js';

function record(
  id: string,
  section: SessionCatalogSection,
  modified: string,
  overrides: Partial<CatalogSessionSummary> = {},
): CatalogRecord {
  const live: CatalogSessionSummary = {
    id,
    sessionId: id,
    lifecycle: section === 'inactive' ? 'archived' : 'live',
    activity: section === 'running' ? 'working' : 'idle',
    runtimeKind: 'top-level',
    sessionName: id,
    cwd: '/project',
    messageCount: 0,
    modified,
    source: 'supervisor',
    ...overrides,
  };
  return { identity: id, identityAliases: [id], live, section, searchableText: id };
}

describe('buildMainAgentActivityModel', () => {
  test('orders needs-input, working, then completed rows and counts the full roster', () => {
    const model = buildMainAgentActivityModel([
      record('old completed', 'inactive', '2026-01-01T00:00:00.000Z'),
      record('working', 'running', '2026-01-03T00:00:00.000Z'),
      record('needs input', 'idle', '2026-01-02T00:00:00.000Z'),
      record('new completed', 'inactive', '2026-01-04T00:00:00.000Z'),
    ]);

    expect(model.counts).toEqual({ running: 1, idle: 1, inactive: 2 });
    expect(model.rows.map(row => row.title)).toEqual(['needs input', 'working', 'new completed', 'old completed']);
  });

  test('caps visible rows without changing section totals', () => {
    const model = buildMainAgentActivityModel(
      [
        record('waiting', 'idle', '2026-01-03T00:00:00.000Z'),
        record('running', 'running', '2026-01-02T00:00:00.000Z'),
        record('done', 'inactive', '2026-01-01T00:00:00.000Z'),
      ],
      2,
    );

    expect(model.rows.map(row => row.title)).toEqual(['waiting', 'running']);
    expect(model.counts.inactive).toBe(1);
  });
});
