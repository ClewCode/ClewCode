import { safeParseJSON } from '../../utils/json.js';

type ParsedToolCall = {
  name: string;
  input: unknown;
  source: 'native' | 'json' | 'repaired';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolObject(record: Record<string, unknown>): ParsedToolCall | null {
  const name = String(record.tool ?? record.name ?? '');
  if (!name) return null;
  const input = record.input ?? record.arguments ?? record.args ?? record.body ?? null;
  return { name, input, source: 'json' };
}

function parseNativeOpenAIToolCall(payload: unknown): ParsedToolCall[] {
  if (!isRecord(payload)) return [];
  const toolCall = payload.tool_call ?? payload.toolCall;
  if (!isRecord(toolCall)) return [];

  const name = String(toolCall.name ?? '');
  if (!name) return [];

  let input: unknown = toolCall.arguments ?? toolCall.arguments_string ?? toolCall.input ?? null;
  if (typeof input === 'string' && input.trim()) {
    const parsed = safeParseJSON(input, false);
    if (parsed !== null) {
      input = parsed;
    }
  }

  return [
    {
      name,
      input,
      source: 'native',
    },
  ];
}

export function parseToolCalls(payload: unknown): ParsedToolCall[] {
  if (isRecord(payload) && Array.isArray(payload.tools)) {
    return payload.tools
      .map(tool => (isRecord(tool) ? parseToolObject(tool) : null))
      .filter((item): item is ParsedToolCall => Boolean(item));
  }

  if (isRecord(payload) && ('tool' in payload || 'name' in payload)) {
    const parsed = parseToolObject(payload);
    return parsed ? [parsed] : [];
  }

  if (isRecord(payload) && 'tool_call' in payload) {
    return parseNativeOpenAIToolCall(payload);
  }

  if (typeof payload === 'string') {
    const parsed = safeParseJSON(payload, false);
    if (isRecord(parsed)) {
      return parseToolCalls(parsed);
    }
  }

  return [];
}
