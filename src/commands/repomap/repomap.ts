/**
 * `/repomap` slash command — inspect, refresh, and view codebase AST structural map.
 */

import { clearRepoMapCache, getRepoMapGenerator } from '../../repomap/index.js';
// @ts-expect-error - Phase3 typecheck auto (TS error suppression)
import type { CommandContext } from '../../types/command.js';
import { getCwd } from '../../utils/cwd.js';

export default async function repomapHandler(args: string, context: CommandContext): Promise<void> {
  const parts = args.trim().split(/\s+/);
  const subCommand = parts[0]?.toLowerCase();
  const root = getCwd();
  const generator = getRepoMapGenerator();

  if (!subCommand || subCommand === 'status' || subCommand === 'info') {
    const { totalFiles, tokenEstimate } = generator.generate(root);
    context.log(`
=== Repo Map (Aider-style AST Snapshot) ===
• Indexed Files with Signatures: ${totalFiles}
• Token Footprint: ~${tokenEstimate} tokens
• Status: Active in System Prompt

Subcommands:
  /repomap view      — Display full structural map
  /repomap refresh   — Clear cache and re-index workspace
`);
    return;
  }

  if (subCommand === 'view' || subCommand === 'show') {
    const { mapText, totalFiles, tokenEstimate } = generator.generate(root);
    if (!mapText || totalFiles === 0) {
      context.log('No source symbols found in workspace.');
      return;
    }

    context.log(`=== Repo Map (${totalFiles} files, ~${tokenEstimate} tokens) ===\n\n${mapText}`);
    return;
  }

  if (subCommand === 'refresh' || subCommand === 'clear' || subCommand === 'reindex') {
    clearRepoMapCache();
    const { totalFiles, tokenEstimate } = generator.generate(root);
    context.log(`✓ Re-indexed Repo Map: ${totalFiles} files, ~${tokenEstimate} tokens.`);
    return;
  }

  context.log(`Unknown /repomap subcommand: "${subCommand}". Use /repomap or /repomap view.`);
}
