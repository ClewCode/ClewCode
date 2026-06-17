import { TeamDashboardDialog } from '../../components/teams/TeamDashboardDialog.js';
import type { ToolUseContext } from '../../Tool.js';
import type { Command, LocalJSXCommandContext, LocalJSXCommandOnDone } from '../../types/command.js';

const team: Command = {
  type: 'local-jsx',
  name: 'team',
  description: 'Open team dashboard — view all in-process teammates and their status',
  immediate: true,
  /**
   * Always enabled — the dashboard gracefully shows "No active teammates"
   * when none exist, so there's no reason to hide the command.
   */
  isEnabled: () => true,
  load: () =>
    Promise.resolve({
      async call(
        onDone: LocalJSXCommandOnDone,
        _context: ToolUseContext & LocalJSXCommandContext,
      ): Promise<React.ReactNode> {
        return <TeamDashboardDialog onDone={() => onDone('', { display: 'system' })} />;
      },
    }),
};

export default team;
