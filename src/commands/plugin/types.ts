import type { MCPServerConnection } from '../../services/mcp/types.js';
import type { Tool } from '../../Tool.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import type { LoadedPlugin } from '../../types/plugin.js';
import type { PluginOptionSchema } from '../../utils/plugins/pluginOptionsStorage.js';

/**
 * Shared view-state for the plugin management UI. Each screen reports its
 * state back through `setViewState` so the root PluginSettings component can
 * route between marketplaces, plugin management, and the top-level menu.
 */
export type ViewState =
  | { type: 'menu' }
  | { type: 'help' }
  | { type: 'validate'; path: string }
  | { type: 'discover-plugins'; targetPlugin?: string }
  | {
      type: 'browse-marketplace';
      targetMarketplace: string;
      targetPlugin?: string;
    }
  | {
      type: 'manage-plugins';
      targetPlugin?: string;
      action?: 'uninstall' | 'enable' | 'disable';
    }
  | { type: 'manage-marketplaces'; targetMarketplace?: string; action?: 'remove' | 'update' }
  | { type: 'add-marketplace'; initialValue?: string }
  | { type: 'marketplace-list' }
  | { type: 'marketplace-menu' }
  | {
      type: 'plugin-options';
      plugin: LoadedPlugin;
      pluginId: string;
    }
  | {
      type: 'mcp-detail';
      client: MCPServerConnection;
    }
  | {
      type: 'mcp-tools';
      client: MCPServerConnection;
    }
  | {
      type: 'mcp-tool-detail';
      client: MCPServerConnection;
      tool: Tool;
    }
  | {
      type: 'configuring-options';
      schema: PluginOptionSchema;
    }
  | {
      type: 'confirm-data-cleanup';
      size: { bytes: number; human: string };
    };

export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone;
  args?: string;
  showMcpRedirectMessage?: boolean;
};
