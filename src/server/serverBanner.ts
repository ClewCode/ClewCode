import ansis from 'ansis';
import type { ServerConfig } from './types.js';

/**
 * Print the server startup banner to stderr (stdout carries protocol traffic).
 */
export function printBanner(config: ServerConfig, authToken: string, actualPort: number): void {
  const baseUrl = config.unix ? `unix:${config.unix}` : `http://${config.host}:${actualPort}`;
  process.stderr.write(
    `${ansis.bold('Clew Code server')} listening at ${ansis.cyan(baseUrl)}\n` +
      `  auth: ${authToken.slice(0, 12)}… (${authToken.length} chars)\n` +
      `  workspace: ${config.workspace ?? '<default>'}\n`,
  );
}
