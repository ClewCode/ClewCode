import * as React from 'react';
import { MessageResponse } from '../../components/MessageResponse.js';
import { Text } from '../../ink.js';
import { formatPeerTaskDashboard } from '../../peer/peerDashboard.js';
import { buildTool } from '../../Tool.js';
import { getCwd } from '../../utils/cwd.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { DESCRIPTION, PEER_DASHBOARD_TOOL_NAME, PROMPT } from './prompt.js';

export const PeerDashboardTool = buildTool({
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  name: PEER_DASHBOARD_TOOL_NAME,
  searchHint: 'show peer task dashboard',
  maxResultSizeChars: 5_000,
  async description() {
    return DESCRIPTION;
  },
  async prompt() {
    return PROMPT;
  },
  get inputSchema() {
    return lazySchema(() => ({ type: 'object', properties: {}, required: [] }))();
  },
  get outputSchema() {
    return lazySchema(() => ({
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        dashboard: { type: 'string' },
        hasPeers: { type: 'boolean' },
        peerCount: { type: 'number' },
        taskCount: { type: 'number' },
        doneCount: { type: 'number' },
      },
      required: ['success', 'dashboard'],
    }))();
  },
  getPath() {
    return getCwd();
  },
  userFacingName() {
    return 'PeerDashboard';
  },
  renderToolUseMessage() {
    return 'showing peer task dashboard...';
  },
  renderToolResultMessage(output: any) {
    if (!output.dashboard) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, { dimColor: true }, 'No peer activity. Share or join peers to get started.'),
      );
    }
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(
        Text,
        { dimColor: true },
        `${output.peerCount} peer(s) · ${output.doneCount}/${output.taskCount} tasks done`,
      ),
    );
  },
  mapToolResultToToolResultBlockParam(output: any, toolUseID: string) {
    if (!output.dashboard) {
      return { tool_use_id: toolUseID, type: 'tool_result', content: '[Peer Dashboard] No peer activity.' };
    }
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: output.dashboard,
    };
  },
  async call() {
    const dashboard = formatPeerTaskDashboard();
    if (!dashboard) {
      return {
        data: {
          success: true,
          dashboard: '',
          hasPeers: false,
          peerCount: 0,
          taskCount: 0,
          doneCount: 0,
        },
      };
    }

    // Count tasks from the dashboard content
    const peerCount = (dashboard.match(/port \d+/g) || []).length;
    const doneCount = (dashboard.match(/☑/g) || []).length;
    const taskCount = (dashboard.match(/[☑☐☒]/g) || []).length;

    return {
      data: {
        success: true,
        dashboard,
        hasPeers: peerCount > 0,
        peerCount,
        taskCount,
        doneCount,
      },
    };
  },
});
