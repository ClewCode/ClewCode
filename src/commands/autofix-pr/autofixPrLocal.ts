/**
 * Local execution path for /autofix-pr.
 *
 * Unlike the teleported remote path (see autofixPr.ts), this runs entirely in
 * the current CLI session — no cloud environment required. It uses `gh` to
 * gather the PR's failing checks, unresolved review comments, and merge state,
 * then hands the agent a structured instruction prompt so it can fix the
 * issues with its local tools (Edit/Bash/etc.), commit, and push.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js';
import { logForDebugging } from '../../utils/debug.js';
import { detectCurrentRepositoryWithHost } from '../../utils/detectRepository.js';
import { execFileNoThrow } from '../../utils/execFileNoThrow.js';
import { detectCurrentPrNumber } from './autofixPr.js';

/** Max characters of any single review-comment / check body we inline. */
const MAX_BODY_CHARS = 800;
/** Max number of review comments / checks we inline to keep the prompt bounded. */
const MAX_ITEMS = 30;

type GhCheck = {
  name: string;
  state: string;
  link?: string;
  workflow?: string;
};

type GhReviewComment = {
  path?: string;
  line?: number | null;
  body: string;
  author: string;
};

type GhReview = {
  author: string;
  state: string;
  body: string;
};

type PrContext = {
  number: number;
  title: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  headRefName: string;
  baseRefName: string;
  url: string;
  failingChecks: GhCheck[];
  pendingChecks: GhCheck[];
  reviews: GhReview[];
  reviewComments: GhReviewComment[];
  issueComments: GhReviewComment[];
};

function truncate(s: string, max = MAX_BODY_CHARS): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}… [truncated]` : t;
}

async function runGh(args: string[], signal?: AbortSignal): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const { stdout, stderr, code } = await execFileNoThrow('gh', args, {
    abortSignal: signal,
    preserveOutputOnError: true,
    timeout: 60_000,
  });
  return { ok: code === 0, stdout, stderr };
}

/**
 * Bucket a statusCheckRollup entry into failing / pending / passing.
 * `gh pr view` rollup entries have either a CheckRun shape (status/conclusion)
 * or a StatusContext shape (state).
 */
function classifyCheck(entry: {
  name?: string;
  context?: string;
  status?: string;
  conclusion?: string;
  state?: string;
  detailsUrl?: string;
  targetUrl?: string;
  workflowName?: string;
}): { bucket: 'fail' | 'pending' | 'pass'; check: GhCheck } {
  const name = entry.name ?? entry.context ?? 'unknown';
  const link = entry.detailsUrl ?? entry.targetUrl;
  const check: GhCheck = { name, state: '', link, workflow: entry.workflowName };

  // StatusContext shape
  if (entry.state) {
    const s = entry.state.toUpperCase();
    check.state = s;
    if (s === 'FAILURE' || s === 'ERROR') return { bucket: 'fail', check };
    if (s === 'PENDING' || s === 'EXPECTED') return { bucket: 'pending', check };
    return { bucket: 'pass', check };
  }

  // CheckRun shape
  const status = (entry.status ?? '').toUpperCase();
  const conclusion = (entry.conclusion ?? '').toUpperCase();
  check.state = conclusion || status;
  if (status !== 'COMPLETED') return { bucket: 'pending', check };
  if (['FAILURE', 'CANCELLED', 'TIMED_OUT', 'STARTUP_FAILURE', 'ACTION_REQUIRED'].includes(conclusion)) {
    return { bucket: 'fail', check };
  }
  return { bucket: 'pass', check };
}

/**
 * Gather PR context needed to drive a local autofix.
 * Returns null (with the reason logged) if the PR can't be read.
 */
async function gatherPrContext(
  owner: string,
  repo: string,
  prNumber: number,
  signal?: AbortSignal,
): Promise<PrContext | null> {
  const slug = `${owner}/${repo}`;
  const view = await runGh(
    [
      'pr',
      'view',
      String(prNumber),
      '--repo',
      slug,
      '--json',
      'number,title,state,isDraft,mergeable,mergeStateStatus,reviewDecision,headRefName,baseRefName,url,statusCheckRollup,reviews,comments',
    ],
    signal,
  );
  if (!view.ok) {
    logForDebugging(`[autofix-pr local] gh pr view failed: ${view.stderr}`);
    return null;
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(view.stdout);
  } catch (e) {
    logForDebugging(`[autofix-pr local] failed to parse pr view JSON: ${String(e)}`);
    return null;
  }

  const failingChecks: GhCheck[] = [];
  const pendingChecks: GhCheck[] = [];
  const rollup = Array.isArray(data.statusCheckRollup) ? data.statusCheckRollup : [];
  for (const entry of rollup) {
    const { bucket, check } = classifyCheck(entry as Parameters<typeof classifyCheck>[0]);
    if (bucket === 'fail') failingChecks.push(check);
    else if (bucket === 'pending') pendingChecks.push(check);
  }

  const reviews: GhReview[] = (Array.isArray(data.reviews) ? data.reviews : [])
    .map((r: { author?: { login?: string }; state?: string; body?: string }) => ({
      author: r.author?.login ?? 'unknown',
      state: r.state ?? '',
      body: truncate(r.body ?? ''),
    }))
    // Only surface reviews that block or request changes / leave substance.
    .filter((r: GhReview) => r.state === 'CHANGES_REQUESTED' || (r.body && r.state !== 'APPROVED'))
    .slice(0, MAX_ITEMS);

  const issueComments: GhReviewComment[] = (Array.isArray(data.comments) ? data.comments : [])
    .map((c: { author?: { login?: string }; body?: string }) => ({
      author: c.author?.login ?? 'unknown',
      body: truncate(c.body ?? ''),
    }))
    .filter((c: GhReviewComment) => c.body)
    .slice(0, MAX_ITEMS);

  // Inline review comments (with file/line) come from the REST API.
  const reviewComments: GhReviewComment[] = [];
  const commentsApi = await runGh(
    [
      'api',
      '--paginate',
      `repos/${owner}/${repo}/pulls/${prNumber}/comments`,
      '--jq',
      '.[] | {path: .path, line: (.line // .original_line), body: .body, author: .user.login}',
    ],
    signal,
  );
  if (commentsApi.ok && commentsApi.stdout.trim()) {
    for (const rawLine of commentsApi.stdout.trim().split('\n')) {
      if (!rawLine.trim()) continue;
      try {
        const c = JSON.parse(rawLine) as { path?: string; line?: number | null; body?: string; author?: string };
        if (c.body) {
          reviewComments.push({
            path: c.path,
            line: c.line ?? null,
            body: truncate(c.body),
            author: c.author ?? 'unknown',
          });
        }
      } catch {
        // skip malformed line
      }
      if (reviewComments.length >= MAX_ITEMS) break;
    }
  }

  return {
    number: Number(data.number ?? prNumber),
    title: String(data.title ?? ''),
    state: String(data.state ?? ''),
    isDraft: Boolean(data.isDraft),
    mergeable: String(data.mergeable ?? 'UNKNOWN'),
    mergeStateStatus: String(data.mergeStateStatus ?? 'UNKNOWN'),
    reviewDecision: String(data.reviewDecision ?? ''),
    headRefName: String(data.headRefName ?? ''),
    baseRefName: String(data.baseRefName ?? ''),
    url: String(data.url ?? ''),
    failingChecks,
    pendingChecks,
    reviews,
    reviewComments,
    issueComments,
  };
}

/** Build the human/agent-facing instruction prompt from gathered context. */
function buildPrompt(ctx: PrContext, owner: string, repo: string, extra: string): string {
  const lines: string[] = [];
  lines.push(`# Autofix PR #${ctx.number} — ${owner}/${repo}`);
  lines.push('');
  lines.push(`Title: ${ctx.title}`);
  lines.push(`Branch: ${ctx.headRefName} → ${ctx.baseRefName}`);
  lines.push(
    `State: ${ctx.state}${ctx.isDraft ? ' (draft)' : ''} | mergeable=${ctx.mergeable} | mergeState=${ctx.mergeStateStatus} | review=${ctx.reviewDecision || 'none'}`,
  );
  lines.push(`URL: ${ctx.url}`);
  lines.push('');

  if (ctx.failingChecks.length > 0) {
    lines.push(`## Failing checks (${ctx.failingChecks.length})`);
    for (const c of ctx.failingChecks) {
      lines.push(`- ${c.name} [${c.state}]${c.link ? ` — ${c.link}` : ''}`);
    }
    lines.push('');
  }
  if (ctx.pendingChecks.length > 0) {
    lines.push(`## Still-running checks (${ctx.pendingChecks.length}) — may need a re-check after fixes`);
    for (const c of ctx.pendingChecks) lines.push(`- ${c.name} [${c.state}]`);
    lines.push('');
  }
  if (ctx.reviewComments.length > 0) {
    lines.push(`## Unresolved inline review comments (${ctx.reviewComments.length})`);
    for (const c of ctx.reviewComments) {
      const loc = c.path ? `${c.path}${c.line ? `:${c.line}` : ''}` : '(general)';
      lines.push(`- [@${c.author} on ${loc}] ${c.body}`);
    }
    lines.push('');
  }
  if (ctx.reviews.length > 0) {
    lines.push(`## Reviews requesting changes (${ctx.reviews.length})`);
    for (const r of ctx.reviews) lines.push(`- [@${r.author}: ${r.state}] ${r.body || '(no body)'}`);
    lines.push('');
  }
  if (ctx.issueComments.length > 0) {
    lines.push(`## PR discussion comments (${ctx.issueComments.length})`);
    for (const c of ctx.issueComments) lines.push(`- [@${c.author}] ${c.body}`);
    lines.push('');
  }

  lines.push('## Your task');
  lines.push('Fix this PR locally, then commit and push. Work through these steps:');
  lines.push('');
  lines.push(
    `1. Make sure the PR branch is checked out: run \`gh pr checkout ${ctx.number} --repo ${owner}/${repo}\` if you are not already on \`${ctx.headRefName}\`.`,
  );
  if (ctx.failingChecks.length > 0) {
    lines.push(
      '2. For each failing check, inspect why it failed (e.g. `gh run view --log-failed`, or run the relevant test/lint/build command locally), reproduce, and fix the root cause.',
    );
  } else {
    lines.push('2. No checks are currently failing — focus on the review feedback below.');
  }
  if (ctx.reviewComments.length > 0 || ctx.reviews.length > 0) {
    lines.push(
      '3. Address each unresolved review comment with a real code change. If a comment is out of scope or you disagree, note it explicitly instead of silently skipping.',
    );
  }
  lines.push('4. After changes, run the project’s lint, typecheck, and tests to confirm everything passes locally.');
  lines.push(
    '5. Commit with a clear message and push to the PR branch. Do NOT force-push or rewrite existing history; add new commits.',
  );
  lines.push(
    '6. Finish with a short summary of what you fixed, what you pushed, and anything that remains blocked or needs a human decision.',
  );
  lines.push('');
  lines.push('Constraints: stay within the scope of this PR. If nothing is actually fixable, say so clearly.');

  if (extra.trim()) {
    lines.push('');
    lines.push(`## Extra instructions from the user`);
    lines.push(extra.trim());
  }

  return lines.join('\n');
}

/**
 * Build the local autofix-pr instruction prompt for the current/target PR.
 * Returns either a prompt to feed the agent (shouldQuery), or an error block.
 */
export async function buildLocalAutofixPrompt(
  args: string,
  signal?: AbortSignal,
): Promise<{ kind: 'prompt'; prompt: string } | { kind: 'error'; blocks: ContentBlockParam[] }> {
  const trimmed = args.trim();
  const leadingNumberMatch = trimmed.match(/^(\d+)\s*(.*)$/);
  let prNumber: number | null = null;
  let extra = trimmed;
  if (leadingNumberMatch) {
    const n = Number(leadingNumberMatch[1]);
    if (Number.isFinite(n)) {
      prNumber = n;
      extra = leadingNumberMatch[2].trim();
    }
  }

  if (!prNumber) {
    prNumber = await detectCurrentPrNumber();
  }
  if (!prNumber) {
    return {
      kind: 'error',
      blocks: [
        {
          type: 'text',
          text:
            'No PR number found. Provide a PR number as the first argument ' +
            '(e.g. `/autofix-pr 123`), or switch to a branch that has an open PR.',
        },
      ],
    };
  }

  const repo = await detectCurrentRepositoryWithHost();
  if (repo?.host !== 'github.com') {
    return {
      kind: 'error',
      blocks: [
        {
          type: 'text',
          text: 'Could not detect a GitHub repository. Make sure you are in a GitHub repo with a remote origin.',
        },
      ],
    };
  }

  const ctx = await gatherPrContext(repo.owner, repo.name, prNumber, signal);
  if (!ctx) {
    return {
      kind: 'error',
      blocks: [
        {
          type: 'text',
          text:
            `Could not read PR #${prNumber} via \`gh\`. Make sure the GitHub CLI is installed and authenticated ` +
            '(`gh auth status`) and that the PR exists.',
        },
      ],
    };
  }

  const hasWork = ctx.failingChecks.length > 0 || ctx.reviewComments.length > 0 || ctx.reviews.length > 0;
  if (!hasWork && ctx.pendingChecks.length === 0) {
    return {
      kind: 'error',
      blocks: [
        {
          type: 'text',
          text:
            `PR #${prNumber} (${repo.owner}/${repo.name}) has no failing checks and no unresolved review feedback to act on. ` +
            (ctx.mergeStateStatus && ctx.mergeStateStatus !== 'CLEAN'
              ? `Merge state is ${ctx.mergeStateStatus}${extra ? '' : ' — nothing to autofix automatically.'}`
              : 'Nothing to autofix.'),
        },
      ],
    };
  }

  return { kind: 'prompt', prompt: buildPrompt(ctx, repo.owner, repo.name, extra) };
}
