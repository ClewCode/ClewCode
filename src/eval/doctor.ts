import { getEvalConfig } from './config.js';
import { loadGraders, loadTasks } from './taskLoader.js';
import { initializeEvalWorkspace } from './workspace.js';

export async function runDiagnostics(
  rootDir: string,
): Promise<{ initialized: boolean; tasksCount: number; gradersCount: number; errors: string[] }> {
  const errors: string[] = [];
  await initializeEvalWorkspace(rootDir);
  const config = getEvalConfig(rootDir);
  const [tasks, graders] = await Promise.all([loadTasks(config), loadGraders(config)]);
  return {
    initialized: true,
    tasksCount: tasks.length,
    gradersCount: graders.length,
    errors,
  };
}
