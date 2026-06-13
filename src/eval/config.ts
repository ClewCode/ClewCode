import { join } from 'path';
import { DOT_CLEW } from '../utils/clewPaths.js';
import type { EvalConfig } from './types.js';

export function getEvalConfig(rootDir: string): EvalConfig {
  const evalDir = join(rootDir, DOT_CLEW, 'evals');
  return {
    rootDir,
    tasksDir: join(evalDir, 'tasks'),
    gradersDir: join(evalDir, 'graders'),
    runsDir: join(evalDir, 'runs'),
  };
}
