/**
 * Shared types and constants for file persistence.
 *
 * This module was referenced by `filePersistence.ts` and `outputsScanner.ts`
 * via `./types.js` but the twin only ever contained `export {}` — the symbols
 * below were undefined at runtime. Recreated here so the real implementation is
 * self-consistent. File persistence remains gated behind the `FILE_PERSISTENCE`
 * feature flag (off by default), so these values only take effect once enabled.
 */

/** Epoch milliseconds captured at turn start (from `Date.now()`). */
export type TurnStartTime = number;

/** Subdirectory under {cwd}/{sessionId} that holds session output files. */
export const OUTPUTS_SUBDIR = 'outputs';

/** Maximum number of modified files persisted in a single turn. */
export const FILE_COUNT_LIMIT = 1000;

/** Default number of concurrent uploads to the Files API. */
export const DEFAULT_UPLOAD_CONCURRENCY = 5;

/** A file successfully persisted to the Files API. */
export interface PersistedFile {
  filename: string;
  file_id: string;
}

/** A file that failed to persist, with the failure reason. */
export interface FailedPersistence {
  filename: string;
  error: string;
}

/** Result of a persistence run: successful files and failures. */
export interface FilesPersistedEventData {
  files: PersistedFile[];
  failed: FailedPersistence[];
}
