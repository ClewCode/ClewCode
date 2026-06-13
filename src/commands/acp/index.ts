import { Command } from 'commander';
import { startACPStdioServer, resolveACPConfig, ACPStatusManager, listSessions } from '../../services/acp/index.js';

const acpCommand = new Command('acp')
  .description('Agent Client Protocol (ACP) — connect editors to Clew Code')
  .addCommand(
    new Command('status')
      .description('Show ACP server status')
      .action(() => {
        const status = ACPStatusManager.getInstance().getStatus();
        const sessions = listSessions();
        console.log(`ACP Status:`);
        console.log(`  Running: ${status.isRunning ? 'Yes' : 'No'}`);
        console.log(`  Transport: ${status.transport ?? 'N/A'}`);
        console.log(`  Active sessions: ${status.activeSessions}`);
        console.log(`  Session details:`);
        if (sessions.length === 0) {
          console.log('    (none)');
        } else {
          for (const s of sessions) {
            const created = new Date(s.createdAt).toLocaleString();
            const active = new Date(s.lastActivityAt).toLocaleString();
            console.log(`    ID: ${s.acpSessionId}`);
            console.log(`      Created: ${created}`);
            console.log(`      Last activity: ${active}`);
          }
        }
      }),
  )
  .addCommand(
    new Command('start')
      .description('Start the ACP server')
      .option('--port <port>', 'WebSocket port (default: stdio mode)')
      .option('--transport <transport>', 'Transport: stdio | websocket (default: stdio)')
      .action(options => {
        const config = resolveACPConfig({
          acp: true,
          acpPort: options.port ? Number(options.port) : undefined,
          acpTransport: options.transport,
        });

        if (config.transport === 'websocket') {
          console.log(`Starting ACP WebSocket server on port ${config.port}...`);
          // TODO: implement WebSocket server
          process.exit(1);
        }

        console.log('Starting ACP stdio server...');
        console.log('Ready for ACP connections. Send NDJSON messages on stdin.');
        startACPStdioServer(config);
      }),
  )
  .addCommand(
    new Command('sessions')
      .description('List active ACP sessions')
      .action(() => {
        const sessions = listSessions();
        if (sessions.length === 0) {
          console.log('No active ACP sessions.');
          return;
        }
        for (const s of sessions) {
          const created = new Date(s.createdAt).toLocaleString();
          console.log(`${s.acpSessionId} (created: ${created})`);
        }
      }),
  )
  .addCommand(
    new Command('config')
      .description('Show ACP configuration example for Zed editor')
      .action(() => {
        console.log('Zed ACP configuration:');
        console.log('~/.config/zed/agent.json');
        console.log(JSON.stringify({
          server: {
            type: 'acp',
            args: ['clew', 'acp'],
          },
        }, null, 2));
      }),
  );

export default acpCommand;
