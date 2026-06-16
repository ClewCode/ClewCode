import { getMaxModeConfig, setMaxModeEnabled, setNumCandidates } from '../../services/maxMode/candidateRunner.js';
import type { LocalJSXCommandCall } from '../../types/command.js';

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const config = getMaxModeConfig();
  const parts = args.trim().split(/\s+/);
  const subcommand = parts[0]?.toLowerCase();

  if (subcommand === 'on') {
    setMaxModeEnabled(true);
    onDone(`Max mode enabled (${config.numCandidates} candidates)`);
    return null;
  }

  if (subcommand === 'off') {
    setMaxModeEnabled(false);
    onDone('Max mode disabled');
    return null;
  }

  if (subcommand === 'candidates') {
    const num = parseInt(parts[1] ?? '', 10);
    if (Number.isNaN(num) || num < 1 || num > 5) {
      onDone('Candidates must be 1-5');
      return null;
    }
    setNumCandidates(num);
    onDone(`Set to ${num} candidates`);
    return null;
  }

  // Toggle
  setMaxModeEnabled(!config.enabled);
  const newConfig = getMaxModeConfig();
  onDone(`Max mode ${newConfig.enabled ? 'enabled' : 'disabled'} (${newConfig.numCandidates} candidates)`);
  return null;
};
