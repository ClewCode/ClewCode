/**
 * Legacy Migration — now no-op (SQLite removed, filesystem is SoT).
 * Kept for import compatibility.
 */

export type MigrationResult = {
  sessionsImported: number;
  digestsImported: number;
  errors: string[];
};

export function migrateFromSessionDB(): MigrationResult {
  return { sessionsImported: 0, digestsImported: 0, errors: [] };
}
