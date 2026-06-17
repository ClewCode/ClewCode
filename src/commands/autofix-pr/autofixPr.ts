/**
 * Teleported /autofix-pr execution. Creates a CCR session with the current repo,
 * attaches the GitHub PR context so the remote agent can watch CI and fix review
 * comments, and registers a RemoteAgentTask so the polling loop pipes results
 * back into the local session via task-notification.
 *
 * Uses skipBundle: true — autofix pushes to GitHub, so a read-only bundle
 * would block the workflow.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { ToolUseContext } from '../../Tool.js';
import {
  checkRemoteAgentEligibility,
  formatPreconditionError,
  getRemoteTaskSessionUrl,
  registerRemoteAgentTask,
} from '../../tasks/RemoteAgentTask/RemoteAgentTask.js';
import { logForDebugging } from '../../utils/debug.js';
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { teleportToRemote } from '../../utils/teleport.js';

/**
 * Try to detect the PR number for the current branch using `gh`.
 */
async function detectCurrentPrNumber(): Promise<number | null> {
  const { stdout, code } = await execFileNoThrow('gh', ['pr', 'view', '--json', 'number', '--jq', '.number'], {
    preserveOutputOnError: false,
  });
  if (code !== 0 || !stdout.trim()) return null;
  const n = Number(stdout.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Launch a teleported autofix-pr session.
 * Returns ContentBlockParam[] describing the launch outcome.
 */
export async function launchAutofixPr(args: string, context: ToolUseContext): Promise<ContentBlockParam[] | null> {
  const eligibility = await checkRemoteAgentEligibility({ skipBundle: true });
  if (!eligibility.eligible) {
    const blockers = eligibility.errors.filter(e => e.type !== 'no_remote_environment');
    if (blockers.length > 0) {
      const reasons = blockers.map(formatPreconditionError).join('\n');
      return [
        {
          type: 'text',
          text: `/autofix-pr cannot launch:\n${reasons}`,
        },
      ];
    }
  }

  // Parse PR number from args (leading number token) or detect from branch
  const trimmed = args.trim();
  const leadingNumberMatch = trimmed.match(/^(\d+)\s*(.*)$/);
  let prNumber: number | null = null;
  let prompt = trimmed;

  if (leadingNumberMatch) {
    prNumber = Number(leadingNumberMatch[1]);
    if (Number.isFinite(prNumber)) {
      prompt = leadingNumberMatch[2].trim();
    } else {
      prNumber = null;
    }
  }

  if (!prNumber) {
    prNumber = await detectCurrentPrNumber();
  }

  if (!prNumber) {
    return [
      {
        type: 'text',
        text:
          'No PR number found. Provide a PR number as the first argument ' +
          '(e.g. `/autofix-pr 123 fix the CI errors`), or switch to a branch that has an open PR.',
      },
    ];
  }

  // Detect current repository
  const repo = await detectCurrentRepositoryWithHost();
  if (repo?.host !== 'github.com') {
    return [
      {
        type: 'text',
        text: 'Could not detect a GitHub repository. Make sure you are in a GitHub repo with a remote origin.',
      },
    ];
  }

  const description = prompt
    ? `autofix-pr: ${repo.owner}/${repo.name}#${prNumber} — ${prompt.slice(0, 60)}`
    : `autofix-pr: ${repo.owner}/${repo.name}#${prNumber}`;

  const session = await teleportToRemote({
    initialMessage: prompt || `Fix CI errors and address review comments on PR #${prNumber}`,
    description,
    signal: context.abortController.signal,
    skipBundle: true,
    githubPr: {
      owner: repo.owner,
      repo: repo.name,
      number: prNumber,
    },
  });

  if (!session) {
    logForDebugging('[autofix-pr] teleportToRemote returned null');
    return [
      {
        type: 'text',
        text: 'Failed to launch remote session. Check your network connection and try again.',
      },
    ];
  }

  registerRemoteAgentTask({
    remoteTaskType: 'autofix-pr',
    session,
    command: `/autofix-pr ${prNumber}`,
    context,
    remoteTaskMetadata: {
      owner: repo.owner,
      repo: repo.name,
      prNumber,
    },
  });

  const sessionUrl = getRemoteTaskSessionUrl(session.id);
  return [
    {
      type: 'text',
      text:
        `Autofix-PR launched for ${repo.owner}/${repo.name}#${prNumber} ` +
        `(~10–20 min, runs in Clew Code on the web). ` +
        `Track: ${sessionUrl}\n` +
        `Results arrive via task-notification.`,
    },
  ];
}

/**
 * LocalJSXCommandCall — entry point for /autofix-pr command invocation.
 */
import type { LocalJSXCommandCall } from '../../types/command.js';

function contentBlocksToString(blocks: ContentBlockParam[]): string {
  return blocks
    .map(b => (b.type === 'text' ? b.text : ''))
    .filter(Boolean)
    .join('\n');
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const result = await launchAutofixPr(args, context);
  if (result) {
    onDone(contentBlocksToString(result), {
      shouldQuery: true,
    });
  } else {
    onDone(
      '/autofix-pr failed to launch the remote session. Check that this is a GitHub repo with an open PR and try again.',
      {
        display: 'system',
      },
    );
  }
  return null;
};
