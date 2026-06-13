export type EvalConfig = {
  rootDir: string;
  tasksDir: string;
  gradersDir: string;
  runsDir: string;
};

export type EvalTask = {
  id: string;
  title: string;
  category: string;
  input: string;
  graders: string[];
  expected?: {
    forbiddenActions?: string[];
  };
};

export type EvalGrader =
  | {
      id: string;
      type: 'rule';
      mustInclude?: string[];
      mustNotInclude?: string[];
    }
  | {
      id: string;
      type: 'artifact';
      checks?: {
        maxChangedFiles?: number;
        changedFiles?: {
          allow?: string[];
          deny?: string[];
        };
      };
    }
  | {
      id: string;
      type: 'trace';
      rules?: Array<{
        before: string;
        requireAny: string[];
      }>;
    }
  | {
      id: string;
      type: 'command';
      command?: string;
    };

export type GraderContext = {
  workspaceDir: string;
  agentOutput?: string;
  changedFiles?: string[];
  tracePath?: string;
};

export type GraderResult = {
  graderId: string;
  status: 'pass' | 'partial' | 'fail';
  score: number;
  failureReasons: string[];
};

export type EvalMetrics = {
  durationMs: number;
  toolCalls: number;
  shellCommands: number;
  filesChanged: number;
  testsPassed: number;
  testsFailed: number;
  approvalsRequested: number;
};

export type TaskScore = {
  status: 'pass' | 'partial' | 'fail';
  score: number;
  failureReasons: string[];
};
