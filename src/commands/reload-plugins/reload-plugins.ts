import { feature } from 'bun:bundle';
import { getIsRemoteMode } from '../../bootstrap/state.js';
import { E_RELOAD_PLUGINS_FAILED } from '../../constants/errorIds.js';
import { redownloadUserSettings } from '../../services/settingsSync/index.js';
import type { LocalCommandCall } from '../../types/command.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { toError } from '../../utils/errors.js';
import { logError } from '../../utils/log.js';
import { refreshActivePlugins } from '../../utils/plugins/refresh.js';
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js';

type ReloadResult = {
  enabled_count: number;
  disabled_count: number;
  command_count: number;
  agent_count: number;
  hook_count: number;
  mcp_count: number;
  lsp_count: number;
  error_count: number;
};

/** One-line summary mirroring upstream Claude Code's `Reloaded: …` format. */
function formatReloadSummary(r: ReloadResult): string {
  let summary =
    `Reloaded: ${r.enabled_count} plugins · ${r.command_count} skills · ${r.agent_count} agents · ` +
    `${r.hook_count} hooks · ${r.mcp_count} plugin MCP servers · ${r.lsp_count} plugin LSP servers`;
  if (r.disabled_count > 0) {
    summary += ` · ${r.disabled_count} disabled`;
  }
  return r.error_count > 0
    ? `${summary} · ${r.error_count} error${r.error_count > 1 ? 's' : ''} (run /doctor)`
    : summary;
}

// Plain `local` command, not `local-jsx`. The old JSX dashboard called
// onDone() with no arguments, falling through to NO_CONTENT_MESSAGE and
// rendering as "(no content)" in the persisted output. A local command must
// always return a `{type: 'text', value: string}` result — no transient
// dashboard/spinner frames possible.
export const call: LocalCommandCall = async (_args, context) => {
  try {
    // redownloadUserSettings uses markInternalWrite (suppresses file watcher,
    // correct for startup). Fire notifyChange manually so mid-session
    // applySettingsChange runs.
    if (feature('DOWNLOAD_USER_SETTINGS') && (isEnvTruthy(process.env.CLEW_CODE_REMOTE) || getIsRemoteMode())) {
      const applied = await redownloadUserSettings();
      if (applied) {
        settingsChangeDetector.notifyChange('userSettings');
      }
    }

    const r = await refreshActivePlugins(context.setAppState);
    return { type: 'text', value: formatReloadSummary(r) };
  } catch (error) {
    const err = toError(error);
    err.cause = { errorId: E_RELOAD_PLUGINS_FAILED };
    logError(err);
    return { type: 'text', value: `Error during reload: ${err.message}` };
  }
};
