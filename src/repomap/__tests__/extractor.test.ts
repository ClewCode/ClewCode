import { describe, expect, it } from 'bun:test';
import { extractFileSymbols } from '../extractor.js';

describe('Repo Map Symbol Extractor', () => {
  it('extracts TypeScript interfaces, types, and exported functions', () => {
    const tsCode = `
export interface UserConfig {
  id: string;
  name: string;
}

export type UserRole = 'admin' | 'member';

export class UserManager {
  constructor() {}
}

export function createUser(name: string): UserConfig {
  return { id: '1', name };
}

export const helper = () => true;
`;

    const symbols = extractFileSymbols(tsCode, 'src/user.ts');
    expect(symbols.length).toBeGreaterThanOrEqual(4);

    expect(symbols.some(s => s.name === 'UserConfig' && s.kind === 'interface')).toBe(true);
    expect(symbols.some(s => s.name === 'UserRole' && s.kind === 'type')).toBe(true);
    expect(symbols.some(s => s.name === 'UserManager' && s.kind === 'class')).toBe(true);
    expect(symbols.some(s => s.name === 'createUser' && s.kind === 'function')).toBe(true);
  });

  it('extracts Python def and class signatures', () => {
    const pyCode = `
class DataPipeline:
    def __init__(self):
        pass

def process_records(records):
    return [r for r in records]
`;

    const symbols = extractFileSymbols(pyCode, 'pipeline.py');
    expect(symbols.some(s => s.name === 'DataPipeline' && s.kind === 'class')).toBe(true);
    expect(symbols.some(s => s.name === 'process_records' && s.kind === 'function')).toBe(true);
  });

  it('extracts Go struct interfaces and functions', () => {
    const goCode = `
type Service interface {
    Start() error
}

func HandleRequest(w http.ResponseWriter, r *http.Request) {
}
`;

    const symbols = extractFileSymbols(goCode, 'service.go');
    expect(symbols.some(s => s.name === 'Service' && s.kind === 'interface')).toBe(true);
    expect(symbols.some(s => s.name === 'HandleRequest' && s.kind === 'function')).toBe(true);
  });
});
