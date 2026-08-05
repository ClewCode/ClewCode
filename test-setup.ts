// `bun test` only sets NODE_ENV=test when the variable is unset. When the
// inherited environment already exports NODE_ENV=production (e.g. a shell that
// ran `bun run build`), Bun keeps that value, which disables the broad set of
// NODE_ENV === 'test' guards the codebase relies on during tests (including
// resetStateForTests and the TestingPermissionTool registration in tools.ts).
// Force test mode here so the suite is deterministic regardless of env.
process.env.NODE_ENV = 'test';
