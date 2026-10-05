import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { LocalJSXCommandCall, LocalJSXCommandOnDone } from '../../types/command.js';
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { getDefaultBranch, gitExe } from '../../utils/git.js';
import { checkOverageGate, confirmOverage, launchRemoteReview } from './reviewRemote.js';
import { UltrareviewLaunchDialog, type UltrareviewScope } from './UltrareviewLaunchDialog.js';

function contentBlocksToString(blocks: ContentBlockParam[]): string {
  return blocks
    .map(b => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}
async function launchAndDone(
  args: string,
  context: Parameters<LocalJSXCommandCall>[1],
  onDone: LocalJSXCommandOnDone,
  billingNote: string,
  signal?: AbortSignal,
): Promise<void> {
  const result = await launchRemoteReview(args, context, billingNote);
  // User hit Escape during the ~5s launch — the dialog already showed
  // "cancelled" and unmounted, so skip onDone (would write to a dead
  // transcript slot) and let the caller skip confirmOverage.
  if (signal?.aborted) return;
  if (result) {
    onDone(contentBlocksToString(result), {
      shouldQuery: true,
    });
  } else {
    // Precondition failures now return specific ContentBlockParam[] above.
    // null only reaches here on teleport failure (PR mode) or non-github
    // repo — both are CCR/repo connectivity issues.
    onDone('Ultrareview failed to launch the remote session. Check that this is a GitHub repo and try again.', {
      display: 'system',
    });
  }
}

// @ts-expect-error - Phase3 typecheck auto (TS error suppression)
function parseNumstat(stdout: string): Pick<UltrareviewScope, 'filesChanged' | 'insertions' | 'deletions'> {
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;

  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue;
    const [added, removed] = line.split(/\s+/);
    filesChanged++;
    if (added && added !== '-') insertions += Number.parseInt(added, 10) || 0;
    if (removed && removed !== '-') deletions += Number.parseInt(removed, 10) || 0;
  }

  return { filesChanged, insertions, deletions };
}

async function getCurrentBranch(): Promise<string> {
  const { stdout } = await execFileNoThrow(gitExe(), ['branch', '--show-current'], { preserveOutputOnError: false });
  return stdout.trim() || 'HEAD';
}

async function getLaunchScope(args: string, billingNote: string): Promise<UltrareviewScope> {
  const trimmed = args.trim();
  if (/^\d+$/.test(trimmed)) {
    const repo = await detectCurrentRepositoryWithHost();
    return {
      target: repo && repo.host === 'github.com' ? `${repo.owner}/${repo.name}#${trimmed}` : `PR #${trimmed}`,
      billingNote: billingNote.trim() || undefined,
    };
  }

  const base = trimmed || (await getDefaultBranch()) || 'main';
  const target = await getCurrentBranch();
  const { stdout: mbOut } = await execFileNoThrow(gitExe(), ['merge-base', base, 'HEAD'], {
    preserveOutputOnError: false,
  });
  const mergeBaseSha = mbOut.trim();
  if (!mergeBaseSha) {
    return { target, base, billingNote: billingNote.trim() || undefined };
  }

  const { stdout: numstat } = await execFileNoThrow(gitExe(), ['diff', '--numstat', mergeBaseSha], {
    preserveOutputOnError: false,
  });

  return {
    target,
    base,
    ...parseNumstat(numstat),
    billingNote: billingNote.trim() || undefined,
  };
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const gate = await checkOverageGate();
  if (gate.kind === 'not-enabled') {
    onDone('Free ultrareviews used. Enable Extra Usage at https://claude.ai/settings/billing to continue.', {
      display: 'system',
    });
    return null;
  }
  if (gate.kind === 'low-balance') {
    onDone(
      `Balance too low to launch ultrareview ($${gate.available.toFixed(2)} available, $10 minimum). Top up at https://claude.ai/settings/billing`,
      {
        display: 'system',
      },
    );
    return null;
  }
  const billingNote = gate.kind === 'needs-confirm' ? 'This review bills as Extra Usage.' : gate.billingNote;
  const scope = await getLaunchScope(args, billingNote);

  return (
    <UltrareviewLaunchDialog
      scope={scope}
      onProceed={async signal => {
        await launchAndDone(args, context, onDone, ` ${billingNote}`.trimEnd(), signal);
        // Only persist the confirmation flag after a non-aborted launch —
        // otherwise Escape-during-launch would leave the flag set and
        // skip billing consent on the next attempt.
        if (gate.kind === 'needs-confirm' && !signal.aborted) confirmOverage();
      }}
      onChangeScope={() => onDone(undefined, { nextInput: '/ultrareview ' })}
      onCancel={() =>
        onDone('Ultrareview cancelled.', {
          display: 'system',
        })
      }
    />
  );
};
