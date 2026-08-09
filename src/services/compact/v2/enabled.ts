/**
 * The v2 enablement switch, deliberately kept in its own leaf module.
 *
 * `tools.ts` needs this to decide whether ContextRestoreTool is enabled. It
 * must NOT reach it through v2/index.ts: that module pulls in the reducers,
 * which pull in compact.ts, sessionStorage, attachments and eventually
 * tools.ts itself. The resulting cycle left services/extractMemories
 * half-initialized at startup and crashed the REPL with
 * "initExtractMemories is not a function".
 *
 * Keep this file's imports to config + env only.
 */
import { getGlobalConfig } from '../../../utils/config.js';
import { isEnvDefinedFalsy, isEnvTruthy } from '../../../utils/envUtils.js';

/**
 * v2 is the default compaction system. `COMPACT_V2=0` or `compactV2: false`
 * force it off — but the legacy path was removed in phase 5, so disabling it
 * means no automatic compaction at all (equivalent to DISABLE_AUTO_COMPACT).
 * This is a kill switch, not a way back to the old behavior.
 */
export function isCompactV2Enabled(): boolean {
  if (isEnvTruthy(process.env.COMPACT_V2)) return true;
  if (isEnvDefinedFalsy(process.env.COMPACT_V2)) return false;
  const setting = (getGlobalConfig() as Record<string, unknown>)?.compactV2;
  return typeof setting === 'boolean' ? setting : true;
}
