import { readdir } from 'fs/promises';
import { getFsImplementation } from '../utils/fsOperations.js';
import { getEvalConfig } from './config.js';
import { loadGraders, loadTasks } from './taskLoader.js';

export interface DoctorResult {
  initialized: boolean;
  tasksCount: number;
  gradersCount: number;
  baselinesCount: number;
  runsCount: number;
  errors: string[];
}

export async function runDiagnostics(cwd: string): Promise<DoctorResult> {
  const fsImpl = getFsImplementation();
  const config = getEvalConfig(cwd);
  const errors: string[] = [];

  const evalsDir = join(cwd, '.ceph', 'evals');
  if (!fsImpl.existsSync(evalsDir)) {
    return {
      initialized: false,
      tasksCount: 0,
      gradersCount: 0,
      baselinesCount: 0,
      runsCount: 0,
      errors: ['Evaluation workspace is not initialized. Run "eval init" first.'],
    };
  }

  let tasksCount = 0;
  let gradersCount = 0;
  let baselinesCount = 0;
  let runsCount = 0;

  try {
    const tasks = await loadTasks(config);
    tasksCount = tasks.length;
  } catch (err: any) {
    errors.push(`Error loading tasks: ${err.message}`);
  }

  try {
    const graders = await loadGraders(config);
    gradersCount = graders.length;
  } catch (err: any) {
    errors.push(`Error loading graders: ${err.message}`);
  }

  try {
    if (fsImpl.existsSync(config.baselinesDir)) {
      const baselines = await readdir(config.baselinesDir);
      baselinesCount = baselines.filter(b => b.endsWith('.json')).length;
    }
  } catch (err: any) {
    errors.push(`Error counting baselines: ${err.message}`);
  }

  try {
    if (fsImpl.existsSync(config.runsDir)) {
      const runs = await readdir(config.runsDir);
      runsCount = runs.length;
    }
  } catch (err: any) {
    errors.push(`Error counting runs: ${err.message}`);
  }

  return {
    initialized: true,
    tasksCount,
    gradersCount,
    baselinesCount,
    runsCount,
    errors,
  };
}

// Make sure join path import is present
import { join } from 'path';
