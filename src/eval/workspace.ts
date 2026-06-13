import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getEvalConfig } from './config.js';

export async function initializeEvalWorkspace(rootDir: string): Promise<void> {
  const config = getEvalConfig(rootDir);
  await mkdir(join(config.tasksDir, 'coding'), { recursive: true });
  await mkdir(config.gradersDir, { recursive: true });
  await mkdir(config.runsDir, { recursive: true });

  await writeFile(
    join(config.tasksDir, 'coding', 'sample-task.yaml'),
    [
      'id: coding.sample-task',
      'title: Sample coding task',
      'category: coding',
      'input: Implement a small utility change',
      'graders:',
      '  - test-pass',
      '',
    ].join('\n'),
    'utf-8',
  );

  await writeFile(
    join(config.gradersDir, 'test-pass.yaml'),
    ['id: test-pass', 'type: command', 'command: bun test --bail', ''].join('\n'),
    'utf-8',
  );
  await writeFile(
    join(config.gradersDir, 'output-rule.yaml'),
    ['id: output-rule', 'type: rule', 'mustInclude:', '  - success', ''].join('\n'),
    'utf-8',
  );
}
