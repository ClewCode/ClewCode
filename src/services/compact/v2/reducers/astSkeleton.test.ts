import { describe, expect, test } from 'bun:test';
import { astSkeletonReducer, extractCodeSkeleton } from './astSkeleton.js';

describe('extractCodeSkeleton', () => {
  test('extracts interfaces, types, imports, and function signatures while stripping internal bodies', () => {
    const sampleCode = `
import { readFile } from 'node:fs/promises';

export interface UserConfig {
  name: string;
  age: number;
}

export type Status = 'active' | 'inactive';

export async function processUserData(config: UserConfig): Promise<Status> {
  const data = await readFile('config.json', 'utf-8');
  console.log('processing...');
  if (!data) {
    throw new Error('Not found');
  }
  return 'active';
}

export class ServiceWorker {
  public start(): void {
    console.log('Worker started');
  }
}
`;

    const skeleton = extractCodeSkeleton(sampleCode);

    expect(skeleton).toContain('import { readFile }');
    expect(skeleton).toContain('export interface UserConfig');
    expect(skeleton).toContain('export type Status');
    expect(skeleton).toContain('export async function processUserData');
    expect(skeleton).not.toContain("console.log('processing...')");
    expect(skeleton).not.toContain("throw new Error('Not found')");
    expect(skeleton.length).toBeLessThan(sampleCode.length);
  });
});

describe('astSkeletonReducer', () => {
  test('has correct name, loss, and cost', () => {
    expect(astSkeletonReducer.name).toBe('ast-skeleton');
    expect(astSkeletonReducer.loss).toBe(0.22);
    expect(astSkeletonReducer.costly).toBe(false);
  });
});
