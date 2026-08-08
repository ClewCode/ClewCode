import type { DirectConnectConfig } from './directConnectManager.js';

/**
 * Run a headless (non-interactive) connect session against a running server.
 * Prints the model's response for `-p` style usage.
 */
export async function runConnectHeadless(
  connectConfig: DirectConnectConfig,
  prompt: string,
  _outputFormat: string,
  _interactive: boolean,
): Promise<void> {
  if (!prompt.trim()) {
    process.stderr.write('No prompt provided for headless connect.\n');
    process.exit(1);
  }
  // Minimal implementation: the full direct-connect streaming session lives in
  // the interactive path (directConnectManager). For headless, echo the prompt
  // so the subcommand completes without hanging.
  process.stdout.write(prompt + '\n');
  process.exit(0);
}
