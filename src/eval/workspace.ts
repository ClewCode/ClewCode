import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { getFsImplementation } from '../utils/fsOperations.js';
import { getEvalConfig } from './config.js';

export async function initializeEvalWorkspace(cwd: string): Promise<void> {
  const fsImpl = getFsImplementation();
  const config = getEvalConfig(cwd);

  const dirs = [
    config.tasksDir,
    join(config.tasksDir, 'coding'),
    join(config.tasksDir, 'research'),
    join(config.tasksDir, 'memory'),
    join(config.tasksDir, 'security'),
    join(config.tasksDir, 'workflow'),
    config.gradersDir,
    config.runsDir,
    config.baselinesDir,
    config.reportsDir,
  ];

  for (const dir of dirs) {
    if (!fsImpl.existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  // Create README.md under tasksDir
  const readmePath = join(config.tasksDir, 'README.md');
  if (!fsImpl.existsSync(readmePath)) {
    const readmeContent = `# Eval Tasks

Place evaluation tasks as \`.yaml\` files in the respective category subdirectories:
- \`coding/\` - For code edits, bug fixes, feature additions
- \`research/\` - For citation and analysis report tasks
- \`memory/\` - For memory priority and retrieval accuracy tasks
- \`security/\` - For permissions and security policy testing tasks
- \`workflow/\` - For multi-agent runtimes and orchestrator trajectory tasks
`;
    await writeFile(readmePath, readmeContent, 'utf-8');
  }

  // Create default graders
  await createDefaultGraders(config.gradersDir);

  // Create sample coding task
  await createSampleTask(join(config.tasksDir, 'coding'));
}

async function createDefaultGraders(gradersDir: string): Promise<void> {
  const fsImpl = getFsImplementation();

  const testPassGrader = join(gradersDir, 'test-pass.yaml');
  if (!fsImpl.existsSync(testPassGrader)) {
    await writeFile(
      testPassGrader,
      `id: test-pass
type: command
commands:
  - bun test
pass_when:
  exit_code: 0
`,
      'utf-8',
    );
  }

  const scopeControlGrader = join(gradersDir, 'scope-control.yaml');
  if (!fsImpl.existsSync(scopeControlGrader)) {
    await writeFile(
      scopeControlGrader,
      `id: scope-control
type: artifact
checks:
  max_changed_files: 5
`,
      'utf-8',
    );
  }

  const evidenceBeforePatch = join(gradersDir, 'evidence-before-patch.yaml');
  if (!fsImpl.existsSync(evidenceBeforePatch)) {
    await writeFile(
      evidenceBeforePatch,
      `id: evidence-before-patch
type: trace
rules:
  - before: repo.patch
    require_any:
      - repo.search
      - repo.open
fail_message: Agent patched files before reading evidence.
`,
      'utf-8',
    );
  }

  const reportFormatGrader = join(gradersDir, 'report-format.yaml');
  if (!fsImpl.existsSync(reportFormatGrader)) {
    await writeFile(
      reportFormatGrader,
      `id: report-format
type: rule
must_include:
  - "## Summary"
  - "## Decisions"
`,
      'utf-8',
    );
  }
}

async function createSampleTask(codingTasksDir: string): Promise<void> {
  const fsImpl = getFsImplementation();
  const sampleTaskPath = join(codingTasksDir, 'sample-task.yaml');

  if (!fsImpl.existsSync(sampleTaskPath)) {
    await writeFile(
      sampleTaskPath,
      `id: coding.sample-task
title: Implement a simple utility function
category: coding
input: |
  Create a utility function in src/utils/math.ts called "add" that adds two numbers.
  Write a test in tests/math.test.ts to verify it.
workspace_fixture: fixtures/math-utility
expected:
  files_changed:
    - src/utils/math.ts
    - tests/math.test.ts
  commands_run:
    - bun test tests/math.test.ts
graders:
  - test-pass
  - scope-control
  - evidence-before-patch
budgets:
  max_steps: 10
  max_tool_calls: 5
`,
      'utf-8',
    );
  }
}
