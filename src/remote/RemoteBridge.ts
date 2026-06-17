/**
 * RemoteBridge — Connects relay/WebSocket messages to CLI execution.
 *
 * Host side:
 *   1. Receives { type: "user", message: "..." } from relay
 *   2. Executes the message as a shell command
 *   3. Sends output back as { type: "assistant", message: "..." }
 */

import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import type { RemoteMessage } from './types.js';

type SendFn = (data: string) => void;

export class RemoteBridge {
  private sendFn: SendFn | null = null;
  private pendingExec: Promise<void> = Promise.resolve();

  /** Register the send function (called when relay/client connects) */
  setSend(sendFn: SendFn): void {
    this.sendFn = sendFn;
  }

  /** Handle an incoming message from the remote */
  async handleMessage(_sessionId: string, message: RemoteMessage): Promise<void> {
    switch (message.type) {
      case 'user': {
        const text = typeof message.message === 'string' ? message.message : '';
        if (!text) return;

        // Queue execution sequentially
        this.pendingExec = this.pendingExec.then(() => this.execute(text));
        await this.pendingExec;
        break;
      }

      case 'control_request': {
        if (message.request && typeof message.request === 'object') {
          const req = message.request as Record<string, unknown>;
          if (req.action === 'ping') {
            this.send({ type: 'control_response', request_id: message.request_id, response: { pong: true } });
          }
        }
        break;
      }
    }
  }

  /** Send a message back to the remote */
  private send(msg: RemoteMessage): void {
    if (!this.sendFn) return;
    try {
      this.sendFn(JSON.stringify(msg));
    } catch (e) {
      logForDebugging(`[RemoteBridge] Send error: ${errorMessage(e)}`);
    }
  }

  /** Execute a shell command and send output back */
  private async execute(command: string): Promise<void> {
    // Send executing status
    this.send({ type: 'system', message: { status: 'executing', command } });

    try {
      const { execSync } = await import('node:child_process');
      const output = execSync(command, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
        killSignal: 'SIGTERM',
      });

      this.send({
        type: 'assistant',
        message: { status: 'success', output: output.trim() || '(empty output)' },
      });
    } catch (err: unknown) {
      const execErr = err as Error & { stdout?: string; stderr?: string };
      const output = execErr.stdout?.trim() || '';
      const errorText = execErr.stderr?.trim() || errorMessage(err);
      this.send({
        type: 'assistant',
        message: {
          status: 'error',
          output: output || '(no output)',
          error: errorText,
        },
      });
    }
  }
}
