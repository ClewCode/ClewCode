type SafeParseResult<T = unknown> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error?: unknown;
    };

type MaybeSafeParseSchema<T = unknown> = {
  safeParse?: (input: unknown) => SafeParseResult<T>;
};

export function safeParseToolInput<T = unknown>(inputSchema: unknown, input: unknown): SafeParseResult<T> {
  const schema = inputSchema as MaybeSafeParseSchema<T> | undefined;
  if (typeof schema?.safeParse === 'function') {
    return schema.safeParse(input);
  }
  return {
    success: true,
    data: input as T,
  };
}
