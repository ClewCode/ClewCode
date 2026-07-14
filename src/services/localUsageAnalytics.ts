import { basename, join } from 'node:path';
import { getSessionId } from '../bootstrap/state.js';
import {
  getModelUsage,
  getTotalAPIDuration,
  getTotalCost,
  getTotalDuration,
  getTotalLinesAdded,
  getTotalLinesRemoved,
} from '../cost-tracker.js';
import { getFsImplementation } from '../utils/fsOperations.js';
import { getProjectsDir } from '../utils/sessionStorage.js';

export type LocalModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
};

export type LocalContributionGroup = {
  title: 'Skills' | 'Plugins' | 'MCP servers';
  entries: Array<{ name: string; percentage: number }>;
};

export type LocalUsageAnalytics = {
  session: {
    costUSD: number;
    apiDurationMs: number;
    wallDurationMs: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  models: Record<string, LocalModelUsage>;
  cacheMissPercentage?: number;
  highContextPercentage?: number;
  contributionGroups: LocalContributionGroup[];
};

export type LocalUsageRecord = {
  type: 'assistant' | 'user';
  timestamp: string;
  sessionId?: string;
  sessionModel?: string;
  durationMs?: number;
  message?: unknown;
  toolUseResult?: unknown;
};

type Usage = LocalModelUsage & { totalTokens: number };
type ToolEvidence = { skills: Set<string>; plugins: Set<string>; mcpServers: Set<string> };

const DAY_MS = 24 * 60 * 60 * 1000;
const HIGH_CONTEXT_TOKENS = 150_000;
const CACHE_MISS_TOKENS = 100_000;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function numberValue(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

function usageFrom(message: Record<string, unknown>): Usage {
  const usage = record(message.usage) ?? {};
  const inputTokens = numberValue(usage, 'input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens');
  const outputTokens = numberValue(usage, 'output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens');
  const cacheReadInputTokens = numberValue(usage, 'cache_read_input_tokens', 'cacheReadInputTokens');
  const cacheCreationInputTokens = numberValue(usage, 'cache_creation_input_tokens', 'cacheCreationInputTokens');
  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    costUSD: numberValue(usage, 'costUSD', 'cost_usd', 'cost'),
    totalTokens: inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens,
  };
}

function modelName(item: LocalUsageRecord, message: Record<string, unknown>): string {
  const sessionModel = item.sessionModel?.split('/').at(-1);
  if (sessionModel && sessionModel !== 'default') return sessionModel;
  return typeof message.model === 'string' ? message.model : 'unknown';
}

function toolEvidence(message: Record<string, unknown>): ToolEvidence {
  const evidence: ToolEvidence = { skills: new Set(), plugins: new Set(), mcpServers: new Set() };
  if (!Array.isArray(message.content)) return evidence;

  for (const item of message.content) {
    const block = record(item);
    if (block?.type !== 'tool_use' || typeof block.name !== 'string') continue;
    if (block.name === 'Skill') {
      const input = record(block.input);
      const skill = typeof input?.skill === 'string' ? input.skill : undefined;
      if (!skill) continue;
      evidence.skills.add(`/${skill}`);
      const separator = skill.indexOf(':');
      if (separator > 0) evidence.plugins.add(skill.slice(0, separator));
      continue;
    }
    const mcp = /^mcp__([^_]+(?:_[^_]+)*)__/.exec(block.name);
    if (mcp?.[1]) evidence.mcpServers.add(mcp[1]);
  }
  return evidence;
}

function countChanges(result: unknown): { added: number; removed: number } {
  const value = record(result);
  if (!value) return { added: 0, removed: 0 };
  if (value.type === 'create' && typeof value.content === 'string') {
    return { added: value.content.split('\n').length, removed: 0 };
  }
  if (!Array.isArray(value.structuredPatch)) return { added: 0, removed: 0 };

  let added = 0;
  let removed = 0;
  for (const rawHunk of value.structuredPatch) {
    const hunk = record(rawHunk);
    if (!Array.isArray(hunk?.lines)) continue;
    for (const line of hunk.lines) {
      if (typeof line !== 'string') continue;
      if (line.startsWith('+')) added++;
      else if (line.startsWith('-')) removed++;
    }
  }
  return { added, removed };
}

function percentage(tokens: number, totalTokens: number): number {
  return Math.round((tokens / totalTokens) * 100);
}

export function aggregateLocalUsageRecords(
  records: readonly LocalUsageRecord[],
  options: { now: Date; currentSessionId?: string },
): LocalUsageAnalytics {
  const recentStart = options.now.getTime() - DAY_MS;
  const recent = records.filter(item => {
    const timestamp = Date.parse(item.timestamp);
    return Number.isFinite(timestamp) && timestamp >= recentStart && timestamp <= options.now.getTime();
  });
  const current = options.currentSessionId ? records.filter(item => item.sessionId === options.currentSessionId) : [];

  const models: Record<string, LocalModelUsage> = {};
  let costUSD = 0;
  let apiDurationMs = 0;
  let linesAdded = 0;
  let linesRemoved = 0;
  const timestamps: number[] = [];

  for (const item of current) {
    const timestamp = Date.parse(item.timestamp);
    if (Number.isFinite(timestamp)) timestamps.push(timestamp);
    apiDurationMs += item.durationMs ?? 0;
    const changes = countChanges(item.toolUseResult);
    linesAdded += changes.added;
    linesRemoved += changes.removed;

    if (item.type !== 'assistant') continue;
    const message = record(item.message);
    if (!message) continue;
    const usage = usageFrom(message);
    costUSD += usage.costUSD;
    const model = modelName(item, message);
    const existing = models[model] ?? {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      costUSD: 0,
    };
    existing.inputTokens += usage.inputTokens;
    existing.outputTokens += usage.outputTokens;
    existing.cacheReadInputTokens += usage.cacheReadInputTokens;
    existing.cacheCreationInputTokens += usage.cacheCreationInputTokens;
    existing.costUSD += usage.costUSD;
    models[model] = existing;
  }

  let recentTokens = 0;
  let highContextTokens = 0;
  let cacheMissTokens = 0;
  const skillTokens = new Map<string, number>();
  const pluginTokens = new Map<string, number>();
  const mcpTokens = new Map<string, number>();

  for (const item of recent) {
    if (item.type !== 'assistant') continue;
    const message = record(item.message);
    if (!message) continue;
    const usage = usageFrom(message);
    recentTokens += usage.totalTokens;
    if (usage.totalTokens > HIGH_CONTEXT_TOKENS) highContextTokens += usage.totalTokens;
    if (usage.inputTokens + usage.cacheCreationInputTokens > CACHE_MISS_TOKENS) cacheMissTokens += usage.totalTokens;
    const evidence = toolEvidence(message);
    for (const name of evidence.skills) skillTokens.set(name, (skillTokens.get(name) ?? 0) + usage.totalTokens);
    for (const name of evidence.plugins) pluginTokens.set(name, (pluginTokens.get(name) ?? 0) + usage.totalTokens);
    for (const name of evidence.mcpServers) mcpTokens.set(name, (mcpTokens.get(name) ?? 0) + usage.totalTokens);
  }

  const groups: LocalContributionGroup[] = [];
  const addGroup = (title: LocalContributionGroup['title'], values: Map<string, number>) => {
    if (values.size === 0 || recentTokens === 0) return;
    groups.push({
      title,
      entries: Array.from(values, ([name, tokens]) => ({ name, percentage: percentage(tokens, recentTokens) })).sort(
        (a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name),
      ),
    });
  };
  addGroup('Skills', skillTokens);
  addGroup('Plugins', pluginTokens);
  addGroup('MCP servers', mcpTokens);

  return {
    session:
      current.length > 0
        ? {
            costUSD,
            apiDurationMs,
            wallDurationMs: timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0,
            linesAdded,
            linesRemoved,
          }
        : null,
    models,
    ...(recentTokens > 0
      ? {
          cacheMissPercentage: percentage(cacheMissTokens, recentTokens),
          highContextPercentage: percentage(highContextTokens, recentTokens),
        }
      : {}),
    contributionGroups: groups,
  };
}

export function parseLocalUsageJsonl(contents: string): LocalUsageRecord[] {
  const records: LocalUsageRecord[] = [];
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = record(JSON.parse(line));
      if (
        (value?.type === 'assistant' || value?.type === 'user') &&
        typeof value.timestamp === 'string' &&
        (typeof value.sessionId === 'string' || value.sessionId === undefined)
      ) {
        records.push(value as LocalUsageRecord);
      }
    } catch {
      // Transcripts may contain a partially written final line.
    }
  }
  return records;
}

async function getSessionFiles(): Promise<string[]> {
  const fs = getFsImplementation();
  let projects;
  try {
    projects = await fs.readdir(getProjectsDir());
  } catch {
    return [];
  }

  const files = await Promise.all(
    projects
      .filter(entry => entry.isDirectory())
      .map(async entry => {
        const directory = join(getProjectsDir(), entry.name);
        try {
          return (await fs.readdir(directory))
            .filter(file => file.isFile() && file.name.endsWith('.jsonl'))
            .map(file => join(directory, file.name));
        } catch {
          return [];
        }
      }),
  );
  return files.flat();
}

export async function loadLocalUsageAnalytics(
  options: { now?: Date; currentSessionId?: string } = {},
): Promise<LocalUsageAnalytics> {
  const fs = getFsImplementation();
  const sessionFiles = await getSessionFiles();
  const records = (
    await Promise.all(
      sessionFiles.map(async file => {
        try {
          const contents = await fs.readFile(file, { encoding: 'utf8' });
          return parseLocalUsageJsonl(contents).map(item => ({
            ...item,
            sessionId: item.sessionId ?? basename(file, '.jsonl'),
          }));
        } catch {
          return [];
        }
      }),
    )
  ).flat();

  const analytics = aggregateLocalUsageRecords(records, {
    now: options.now ?? new Date(),
    currentSessionId: options.currentSessionId ?? getSessionId(),
  });
  const liveModels = getModelUsage();
  const models = Object.fromEntries(
    Object.entries(liveModels).map(([model, usage]) => [
      model,
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        costUSD: usage.costUSD,
      },
    ]),
  );

  return {
    ...analytics,
    session: {
      costUSD: getTotalCost(),
      apiDurationMs: getTotalAPIDuration(),
      wallDurationMs: getTotalDuration(),
      linesAdded: getTotalLinesAdded(),
      linesRemoved: getTotalLinesRemoved(),
    },
    models,
  };
}
