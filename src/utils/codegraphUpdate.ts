import { getCwd } from './cwd.js';
import { logForDebugging } from './debug.js';
import { execFileNoThrowWithCwd } from './execFileNoThrow.js';
import { logError } from './log.js';

const CODEGRAPH_UPDATE_DELAY_MS = 2_000;
const CODEGRAPH_UPDATE_TIMEOUT_MS = 60_000;

let pendingUpdate: ReturnType<typeof setTimeout> | null = null;
let runningUpdate: Promise<void> | null = null;
let rerunAfterCurrent = false;

function shouldUpdateCodegraph(filePath: string): boolean {
  return /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx|json|md|mdx|py|go|rs|java|kt|kts|cs|cpp|cc|cxx|h|hpp)$/.test(filePath);
}

async function runCodegraphUpdate(): Promise<void> {
  const result = await execFileNoThrowWithCwd('graphify', ['update', '.'], {
    cwd: getCwd(),
    timeout: CODEGRAPH_UPDATE_TIMEOUT_MS,
    preserveOutputOnError: false,
  });

  if (result.code !== 0) {
    logForDebugging('[codegraph] graphify update skipped or failed');
  }
}

function startUpdate(): void {
  if (runningUpdate) {
    rerunAfterCurrent = true;
    return;
  }

  runningUpdate = runCodegraphUpdate()
    .catch(err => {
      logError(err instanceof Error ? err : new Error(String(err)));
    })
    .finally(() => {
      runningUpdate = null;
      if (rerunAfterCurrent) {
        rerunAfterCurrent = false;
        scheduleCodegraphUpdate();
      }
    });
}

export function scheduleCodegraphUpdate(filePath?: string): void {
  if (filePath && !shouldUpdateCodegraph(filePath)) return;

  if (pendingUpdate) {
    clearTimeout(pendingUpdate);
  }

  pendingUpdate = setTimeout(() => {
    pendingUpdate = null;
    startUpdate();
  }, CODEGRAPH_UPDATE_DELAY_MS);
}
