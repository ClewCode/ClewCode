declare module '../../services/compact/reactiveCompact.js' {
  export function isReactiveOnlyMode(): boolean;
  export function isReactiveCompactEnabled(): boolean;
  export function isWithheldPromptTooLong(message: unknown): boolean;
  export function isWithheldMediaSizeError(message: unknown): boolean;
  export function tryReactiveCompact(opts: {
    messages: unknown[];
    cacheSafeParams: unknown;
    hasAttempted: boolean;
  }): Promise<unknown>;
  export function reactiveCompactOnPromptTooLong(
    messages: unknown[],
    cacheSafeParams: unknown,
    opts: { querySource?: string },
  ): Promise<unknown>;
}

export {};
