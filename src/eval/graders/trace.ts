import { readFile } from 'fs/promises';
import { getFsImplementation } from '../../utils/fsOperations.js';
import type { EvalTask, GraderConfig, GraderResult } from '../types.js';
import type { GraderContext } from './index.js';

interface RunEvent {
  timestamp: string;
  type: string;
  message: string;
  metadata?: Record<string, any>;
}

export async function runTraceGrader(
  grader: GraderConfig,
  task: EvalTask,
  context: GraderContext,
): Promise<GraderResult> {
  const fsImpl = getFsImplementation();
  const failureReasons: string[] = [];

  if (!context.tracePath || !fsImpl.existsSync(context.tracePath)) {
    return {
      graderId: grader.id,
      status: 'fail',
      score: 0,
      failureReasons: [`Trace file not found at path: ${context.tracePath || 'undefined'}`],
    };
  }

  let events: RunEvent[] = [];
  try {
    const fileContent = await readFile(context.tracePath, 'utf-8');
    events = fileContent
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as RunEvent);
  } catch (err: any) {
    return {
      graderId: grader.id,
      status: 'error',
      score: 0,
      failureReasons: [`Failed to parse trace log: ${err.message}`],
    };
  }

  const rules = grader.rules || [];
  for (const rule of rules) {
    const beforeAction = rule.before;
    const requireAny = rule.requireAny || [];

    if (!beforeAction) continue;

    // Find the index of the first occurrence of beforeAction
    const beforeIdx = events.findIndex(e => {
      const typeMatch = e.type === beforeAction;
      const toolMatch = e.metadata?.tool === beforeAction;
      const msgMatch = e.message.includes(beforeAction);
      return typeMatch || toolMatch || msgMatch;
    });

    if (beforeIdx !== -1) {
      // Checked action occurred. Let's make sure at least one required action occurred before it.
      let foundRequired = false;
      for (let i = 0; i < beforeIdx; i++) {
        const e = events[i];
        const hasReq = requireAny.some(req => {
          const typeMatch = e.type === req;
          const toolMatch = e.metadata?.tool === req;
          const msgMatch = e.message.includes(req);
          return typeMatch || toolMatch || msgMatch;
        });

        if (hasReq) {
          foundRequired = true;
          break;
        }
      }

      if (!foundRequired) {
        failureReasons.push(
          grader.failMessage ||
            `Trace Rule Violation: Action "${beforeAction}" was called, but none of the required preliminary steps (${requireAny.join(
              ', ',
            )}) occurred before it.`,
        );
      }
    }
  }

  const passed = failureReasons.length === 0;

  return {
    graderId: grader.id,
    status: passed ? 'pass' : 'fail',
    score: passed ? 1.0 : 0.0,
    failureReasons,
  };
}
