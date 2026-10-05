// ponytail: ant-only feature, absent from this port — no-op exports keep the
// COMMIT_ATTRIBUTION dynamic imports from crashing if the flag is ever enabled.
export function registerAttributionHooks(): void {}
export function clearAttributionCaches(): void {}
export function sweepFileContentCache(): void {}
export default {} as any;
