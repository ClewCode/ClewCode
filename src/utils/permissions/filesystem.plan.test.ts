import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { getSessionId } from '../../bootstrap/state.js';
import { getPlansDirectory, setPlanSlug } from '../plans.js';
import { checkEditableInternalPath } from './filesystem.js';

describe('session plan path permission boundary', () => {
  test('allows only the current plan filename and its agent variants', () => {
    const slug = 'audit-plan-boundary';
    setPlanSlug(getSessionId(), slug);
    const plansDir = getPlansDirectory();

    expect(checkEditableInternalPath(join(plansDir, `${slug}.md`), {}).behavior).toBe('allow');
    expect(checkEditableInternalPath(join(plansDir, `${slug}-agent-worker-1.md`), {}).behavior).toBe('allow');
    expect(checkEditableInternalPath(join(plansDir, `${slug}-admin.md`), {}).behavior).toBe('passthrough');
    expect(checkEditableInternalPath(join(plansDir, `${slug}2.md`), {}).behavior).toBe('passthrough');
  });
});
