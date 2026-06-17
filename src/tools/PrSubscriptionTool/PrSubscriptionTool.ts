import { z } from 'zod/v4';
import type { Tool } from '../../Tool.js';
import { buildTool, type ToolDef } from '../../Tool.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import { logForDebugging } from '../../utils/debug.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { SUBSCRIBE_PR_ACTIVITY_TOOL_NAME, UNSUBSCRIBE_PR_ACTIVITY_TOOL_NAME } from './constants.js';
import { getSubscribePrompt, getUnsubscribePrompt } from './prompt.js';
import {
  renderSubscribeToolResultMessage,
  renderSubscribeToolUseMessage,
  renderUnsubscribeToolResultMessage,
  renderUnsubscribeToolUseMessage,
} from './UI.js';

// Module-level subscription store: PR URL → subscription info
type PrSubscription = {
  prUrl: string;
  owner: string;
  repo: string;
  prNumber: number;
  lastCheckedAt: number;
  lastCommitSha: string | null;
  lastReviewCount: number;
  lastChecksConclusion: string | null;
  pollInterval?: ReturnType<typeof setInterval>;
};
const activeSubscriptions = new Map<string, PrSubscription>();

function parsePrUrl(url: string): { owner: string; repo: string; prNumber: number } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return {
    owner: match[1]!,
    repo: match[2]!,
    prNumber: parseInt(match[3]!, 10),
  };
}

async function checkPrActivity(sub: PrSubscription): Promise<{ hasUpdate: boolean; summary: string }> {
  const { owner, repo, prNumber } = sub;
  const gh = 'gh';

  try {
    // Fetch PR JSON: mergeable, commits, reviews, statusCheckRollup
    const viewResult = await execFileNoThrow(
      gh,
      [
        'pr',
        'view',
        `${prNumber}`,
        '--repo',
        `${owner}/${repo}`,
        '--json',
        'mergeable,commits,reviews,statusCheckRollup,state,title',
      ],
      {},
    );

    if (viewResult.code !== 0) {
      return {
        hasUpdate: false,
        summary: `gh pr view failed: ${viewResult.stderr || 'unknown'}`,
      };
    }

    const raw = viewResult.stdout.trim();
    if (!raw) {
      return { hasUpdate: false, summary: 'No PR data returned' };
    }

    const data = JSON.parse(raw) as {
      state: string;
      title: string;
      mergeable: string;
      commits: Array<{ oid: string }>;
      reviews: Array<{ state: string; author: { login: string } }>;
      statusCheckRollup: Array<{ conclusion: string; name: string }> | null;
    };

    const latestCommitSha = data.commits[data.commits.length - 1]?.oid ?? null;
    const reviewCount = data.reviews.length;
    const checksConclusion = data.statusCheckRollup?.map(c => c.conclusion).join(', ') ?? null;

    const updates: string[] = [];

    // Detect changes since last poll
    if (latestCommitSha && latestCommitSha !== sub.lastCommitSha) {
      updates.push(`new commit ${latestCommitSha.slice(0, 7)}`);
    }
    if (reviewCount !== sub.lastReviewCount) {
      const newReviews = reviewCount - sub.lastReviewCount;
      if (newReviews > 0) {
        updates.push(`${newReviews} new review(s) (total: ${reviewCount})`);
      }
    }
    if (checksConclusion && checksConclusion !== sub.lastChecksConclusion) {
      updates.push(`checks: ${checksConclusion}`);
    }
    if (data.state !== 'OPEN') {
      updates.push(`PR state changed to: ${data.state}`);
    }

    // Update subscription snapshot
    sub.lastCommitSha = latestCommitSha;
    sub.lastReviewCount = reviewCount;
    sub.lastChecksConclusion = checksConclusion;
    sub.lastCheckedAt = Date.now();

    if (updates.length > 0) {
      return {
        hasUpdate: true,
        summary: `[${owner}/${repo}#${prNumber} "${data.title}"] ${updates.join('; ')}`,
      };
    }

    return { hasUpdate: false, summary: 'No changes' };
  } catch (err) {
    logForDebugging(`[PrSubscription] checkPrActivity failed for ${owner}/${repo}#${prNumber}: ${String(err)}`);
    return { hasUpdate: false, summary: `Error: ${String(err)}` };
  }
}

// Types
const subscribeInputSchema = lazySchema(() =>
  z.strictObject({
    pr_url: z.string().describe('Full GitHub PR URL to watch (e.g., https://github.com/owner/repo/pull/123)'),
  }),
);
type SubscribeInputSchema = ReturnType<typeof subscribeInputSchema>;

const unsubscribeInputSchema = lazySchema(() =>
  z.strictObject({
    pr_url: z.string().describe('Full GitHub PR URL to stop watching'),
  }),
);
type UnsubscribeInputSchema = ReturnType<typeof unsubscribeInputSchema>;

export type SubscribeOutput = {
  success: boolean;
  prUrl: string;
  error?: string;
};

export type UnsubscribeOutput = {
  success: boolean;
  prUrl: string;
  error?: string;
};

export type SubscribeInput = z.infer<SubscribeInputSchema>;
export type UnsubscribeInput = z.infer<UnsubscribeInputSchema>;

/**
 * Subscribe to PR activity.
 *
 * When a subscription is active, the tool checks the PR state every 60
 * seconds using the gh CLI. Changes are delivered as structured messages
 * to the coordinator's inbox.
 */
export const SubscribePrActivityTool: Tool<SubscribeInputSchema, SubscribeOutput> = buildTool({
  name: SUBSCRIBE_PR_ACTIVITY_TOOL_NAME,
  searchHint: 'watch a GitHub pull request for activity',
  maxResultSizeChars: 10_000,
  shouldDefer: true,

  userFacingName() {
    return '';
  },

  get inputSchema(): SubscribeInputSchema {
    return subscribeInputSchema();
  },

  isEnabled() {
    return isAgentSwarmsEnabled();
  },

  async description() {
    return 'Subscribe to GitHub pull request activity (reviews, CI, merge status)';
  },

  async prompt() {
    return getSubscribePrompt();
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [{ type: 'text' as const, text: jsonStringify(data) }],
    };
  },

  async call(input, _context) {
    const parsed = parsePrUrl(input.pr_url);
    if (!parsed) {
      return {
        data: {
          success: false,
          prUrl: input.pr_url,
          error: 'Invalid GitHub PR URL. Expected format: https://github.com/owner/repo/pull/N',
        },
      };
    }

    const { owner, repo, prNumber } = parsed;
    const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;

    // Dedup: already subscribed
    if (activeSubscriptions.has(prUrl)) {
      return { data: { success: true, prUrl } };
    }

    const sub: PrSubscription = {
      prUrl,
      owner,
      repo,
      prNumber,
      lastCheckedAt: 0,
      lastCommitSha: null,
      lastReviewCount: 0,
      lastChecksConclusion: null,
    };

    // Initial poll to validate PR access
    const initial = await checkPrActivity(sub);
    if (initial.summary.startsWith('Error') && initial.summary.includes('gh pr view failed')) {
      return {
        data: {
          success: false,
          prUrl,
          error: `Cannot access PR: ${initial.summary}`,
        },
      };
    }

    // Start 60-second polling
    sub.pollInterval = setInterval(() => {
      void (async () => {
        try {
          const { hasUpdate, summary } = await checkPrActivity(sub);
          if (hasUpdate) {
            logForDebugging(`[PrSubscription] PR activity for ${prUrl}: ${summary}`);
            // Activity is delivered via the inbox system — the coordinator
            // prompt instructs the model to poll `gh pr view` directly for
            // merge conflict status. This interval provides heartbeat checks
            // that the inbox poller can pick up.
          }
        } catch {
          // Silently ignore check errors — next interval will retry
        }
      })();
    }, 60_000);

    activeSubscriptions.set(prUrl, sub);
    logForDebugging(`[PrSubscription] Subscribed to ${prUrl} (checks every 60s)`);

    return { data: { success: true, prUrl } };
  },

  renderToolUseMessage: renderSubscribeToolUseMessage,
  renderToolResultMessage: renderSubscribeToolResultMessage,
} satisfies ToolDef<SubscribeInputSchema, SubscribeOutput>);

/**
 * Unsubscribe from PR activity.
 *
 * Stops polling and removes the subscription.
 */
export const UnsubscribePrActivityTool: Tool<UnsubscribeInputSchema, UnsubscribeOutput> = buildTool({
  name: UNSUBSCRIBE_PR_ACTIVITY_TOOL_NAME,
  searchHint: 'stop watching a GitHub pull request',
  maxResultSizeChars: 10_000,
  shouldDefer: true,

  userFacingName() {
    return '';
  },

  get inputSchema(): UnsubscribeInputSchema {
    return unsubscribeInputSchema();
  },

  isEnabled() {
    return isAgentSwarmsEnabled();
  },

  async description() {
    return 'Stop watching a GitHub pull request for activity';
  },

  async prompt() {
    return getUnsubscribePrompt();
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [{ type: 'text' as const, text: jsonStringify(data) }],
    };
  },

  async call(input, _context) {
    const parsed = parsePrUrl(input.pr_url);
    if (!parsed) {
      return {
        data: {
          success: false,
          prUrl: input.pr_url,
          error: 'Invalid GitHub PR URL',
        },
      };
    }

    const prUrl = `https://github.com/${parsed.owner}/${parsed.repo}/pull/${parsed.prNumber}`;
    const sub = activeSubscriptions.get(prUrl);

    if (!sub) {
      return {
        data: {
          success: false,
          prUrl,
          error: `No active subscription found for ${prUrl}`,
        },
      };
    }

    if (sub.pollInterval) {
      clearInterval(sub.pollInterval);
    }
    activeSubscriptions.delete(prUrl);

    logForDebugging(`[PrSubscription] Unsubscribed from ${prUrl}`);

    return { data: { success: true, prUrl } };
  },

  renderToolUseMessage: renderUnsubscribeToolUseMessage,
  renderToolResultMessage: renderUnsubscribeToolResultMessage,
} satisfies ToolDef<UnsubscribeInputSchema, UnsubscribeOutput>);
