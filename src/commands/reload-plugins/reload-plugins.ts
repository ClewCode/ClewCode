import { feature } from 'bun:bundle';
import { getIsRemoteMode } from '../../bootstrap/state.js';
import { redownloadUserSettings } from '../../services/settingsSync/index.js';
import type { LocalCommandCall } from '../../types/command.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { refreshActivePlugins } from '../../utils/plugins/refresh.js';
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js';

type ReloadResult = {
  enabled_count: number;
  command_count: number;
  agent_count: number;
  hook_count: number;
  mcp_count: number;
  lsp_count: number;
  error_count: number;
};

/** One-line summary mirroring upstream Claude Code's `Reloaded: …` format. */
function formatReloadSummary(r: ReloadResult): string {
  const summary =
    `Reloaded: ${r.enabled_count} plugins · ${r.command_count} skills · ${r.agent_count} agents · ` +
    `${r.hook_count} hooks · ${r.mcp_count} plugin MCP servers · ${r.lsp_count} plugin LSP servers`;
  return r.error_count > 0
    ? `${summary} · ${r.error_count} error${r.error_count > 1 ? 's' : ''} (run /doctor)`
    : summary;
}

// Plain `local` command — no React/JSX render, so there is no transient
// dashboard/spinner frame. The reload runs to completion and the one-line
// summary is returned as the result (never a bare "(no content)").
export const call: LocalCommandCall = async (_args, context) => {
  try {
    if (feature('DOWNLOAD_USER_SETTINGS') && (isEnvTruthy(process.env.CLEW_CODE_REMOTE) || getIsRemoteMode())) {
      const applied = await redownloadUserSettings();
      if (applied) {
        settingsChangeDetector.notifyChange('userSettings');
      }
    }

    const r = await refreshActivePlugins(context.setAppState);
    return { type: 'text', value: formatReloadSummary(r) };
  } catch (error) {
    return { type: 'text', value: `Error during reload: ${(error as Error).message}` };
  }
};
