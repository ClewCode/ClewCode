import { describe, expect, it } from 'bun:test';
import { extractTasksFromPlan } from './planTasks.js';

describe('extractTasksFromPlan', () => {
  it('extracts checklist items correctly', () => {
    const plan = `# My Feature Plan

## User Review Required
> Important notes here

## Proposed Changes
- [ ] Add new endpoint in server.ts
- [ ] Update client fetcher in api.ts
- [x] Already done task

## Verification Plan
- [ ] Run bun test
- [ ] Check manual curl
`;

    const tasks = extractTasksFromPlan(plan);
    expect(tasks).toHaveLength(5);
    expect(tasks[0]?.subject).toBe('Add new endpoint in server.ts');
    expect(tasks[0]?.group).toBe('Proposed Changes');
    expect(tasks[3]?.subject).toBe('Run bun test');
    expect(tasks[3]?.group).toBe('Verification Plan');
    expect(tasks[3]?.groupOrder).toBe(99);
  });

  it('extracts file action headers correctly', () => {
    const plan = `# Implementation Plan

## Proposed Changes
### Backend
#### [MODIFY] src/server.ts
- Add auth route
#### [NEW] src/middleware/auth.ts
- Implement token check

### Frontend
#### [MODIFY] src/App.tsx
- Add login button
`;

    const tasks = extractTasksFromPlan(plan);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.subject).toBe('[MODIFY] src/server.ts');
    expect(tasks[0]?.group).toBe('Backend');
    expect(tasks[1]?.subject).toBe('[NEW] src/middleware/auth.ts');
    expect(tasks[1]?.group).toBe('Backend');
    expect(tasks[2]?.subject).toBe('[MODIFY] src/App.tsx');
    expect(tasks[2]?.group).toBe('Frontend');
  });

  it('extracts numbered steps when no checklists exist', () => {
    const plan = `# Goal

## Implementation Steps
1. Create database schema for users
2. Add migration script
3. Write service layer
`;

    const tasks = extractTasksFromPlan(plan);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]?.subject).toBe('Create database schema for users');
    expect(tasks[1]?.subject).toBe('Add migration script');
    expect(tasks[2]?.subject).toBe('Write service layer');
  });

  it('ignores non-actionable sections like open questions and background', () => {
    const plan = `# Goal

## Background
- Some background info
- More context

## Open Questions
- Question 1: What about X?
- Question 2: What about Y?

## Steps
1. Actual step 1
2. Actual step 2
`;

    const tasks = extractTasksFromPlan(plan);
    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.subject).toBe('Actual step 1');
    expect(tasks[1]?.subject).toBe('Actual step 2');
  });
});
