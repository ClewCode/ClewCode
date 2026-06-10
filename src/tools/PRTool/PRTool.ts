import { execSync } from 'node:child_process';
import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { PR_TOOL_NAME, PR_TOOL_SEARCH_HINT } from './constants.js';
import { DESCRIPTION, generatePrompt } from './prompt.js';
import { renderToolResultMessage, renderToolUseMessage, renderToolUseRejectedMessage } from './UI.js';

// --- Schema ---

const inputSchema = lazySchema(() =>
  z.discriminatedUnion('action', [
    z.object({
      action: z.literal('create'),
    }),
    z.object({
      action: z.literal('list'),
    }),
    z.object({
      action: z.literal('view'),
      pr_number: z.number().describe('PR number to view'),
    }),
    z.object({
      action: z.literal('review'),
      pr_number: z.number().describe('PR number to review'),
    }),
    z.object({
      action: z.literal('merge'),
      pr_number: z.number().describe('PR number to merge'),
    }),
    z.object({
      action: z.literal('status'),
      branch: z.string().optional().describe('Branch name (defaults to current branch)'),
    }),
  ]),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    action: z.string(),
    message: z.string(),
    data: z.string().optional(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

type Input = z.infer<InputSchema>;
type Output = z.infer<OutputSchema>;

// --- Helpers ---

function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 }).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`gh failed: ${msg.slice(0, 500)}`);
  }
}

function ghSafe(args: string): string {
  try {
    return gh(args);
  } catch {
    return '';
  }
}

// --- Action handlers ---

async function handleCreate(): Promise<{ data: Output }> {
  try {
    const branch = gh('branch --show-current');
    const title = ghSafe('pr view --json title --jq .title') || `Changes on ${branch}`;
    const body = ghSafe('pr view --json body --jq .body') || '';

    const result = gh(
      `pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').slice(0, 2000)}" --fill`,
    );
    const url = result.match(/https:\/\/github\.com\/\S+/) ? result : ghSafe('pr view --json url --jq .url');

    return {
      data: {
        success: true,
        action: 'create',
        message: `PR created on ${branch}`,
        data: url || result,
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'create',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function handleList(): Promise<{ data: Output }> {
  try {
    const output = gh(
      'pr list --state open --limit 20 --json number,title,headRefName,author,createdAt,mergeable,reviews --jq \'.[] | "#(.number) (.title) ((.headRefName))"',
    );
    if (!output) {
      return { data: { success: true, action: 'list', message: 'No open PRs.' } };
    }
    const lines = output.split('\n').filter(Boolean);
    return {
      data: {
        success: true,
        action: 'list',
        message: `Open PRs (${lines.length}):`,
        data: lines.map(l => `  ${l}`).join('\n'),
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'list',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function handleView(prNumber: number): Promise<{ data: Output }> {
  try {
    const info = gh(
      `pr view ${prNumber} --json number,title,state,headRefName,baseRefName,author,createdAt,mergeable,additions,deletions,files,reviews,body,url`,
    );
    const data = JSON.parse(info) as {
      number: number;
      title: string;
      state: string;
      headRefName: string;
      baseRefName: string;
      author: { login: string };
      createdAt: string;
      mergeable: string;
      additions: number;
      deletions: number;
      files?: Array<{ path: string }>;
      url: string;
      body?: string;
      reviews?: Array<{ state: string; author: { login: string } }>;
    };
    const lines: string[] = [
      `PR #${data.number}: ${data.title}`,
      `State: ${data.state}  Mergeable: ${data.mergeable}`,
      `Branch: ${data.headRefName} \u2192 ${data.baseRefName}`,
      `Author: ${data.author.login}  Created: ${data.createdAt.slice(0, 10)}`,
      `Changes: +${data.additions}/-${data.deletions}  Files: ${data.files?.length ?? 0}`,
      `URL: ${data.url}`,
    ];
    if (data.reviews?.length) {
      lines.push(`Reviews: ${data.reviews.filter(r => r.state === 'APPROVED').length} approved`);
    }
    if (data.body) {
      lines.push(`\nDescription: ${data.body.slice(0, 300)}${data.body.length > 300 ? '\u2026' : ''}`);
    }
    return {
      data: {
        success: true,
        action: 'view',
        message: `PR #${prNumber}`,
        data: lines.join('\n'),
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'view',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function handleReview(prNumber: number): Promise<{ data: Output }> {
  try {
    const diff = gh(`pr diff ${prNumber}`);
    const info = JSON.parse(gh(`pr view ${prNumber} --json title,body`)) as { title: string; body?: string };

    const reviewPrompt = `Review this PR and identify any bugs, security issues, or logic errors.

PR #${prNumber}: ${info.title}
${info.body ? `Description: ${info.body.slice(0, 500)}` : ''}

\`\`\`diff
${diff.slice(0, 8000)}
\`\`\`

Focus on:
1. Logic errors or incorrect assumptions
2. Security vulnerabilities
3. Missing edge cases
4. Performance issues
5. API misuse or type errors

For each issue found, cite the exact file and line number.`;

    return {
      data: {
        success: true,
        action: 'review',
        message: `PR #${prNumber} diff fetched (${diff.length} chars). Review the changes below:`,
        data: reviewPrompt,
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'review',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function handleMerge(prNumber: number): Promise<{ data: Output }> {
  try {
    const title = ghSafe(`pr view ${prNumber} --json title -q '.title'`) || `PR #${prNumber}`;
    const result = gh(`pr merge ${prNumber} --squash --subject "${title.replace(/"/g, '\\"')}"`);
    return {
      data: {
        success: true,
        action: 'merge',
        message: `PR #${prNumber} merged (squash): ${title}`,
        data: result,
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'merge',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

async function handleStatus(branch?: string): Promise<{ data: Output }> {
  try {
    const currentBranch = branch || ghSafe('branch --show-current') || 'unknown';
    const prInfo = ghSafe(
      `pr view --json number,title,state,mergeable,reviews --jq '[.number, .title, .state, .mergeable] | @tsv'`,
    );
    const checks = ghSafe('pr checks --limit 10 --json name,state,branch');

    const lines = [`Status for ${currentBranch}`];

    if (prInfo) {
      const [num, title, state] = prInfo.split('\t');
      lines.push(`PR #${num}: ${title} [${state}]`);
    } else {
      lines.push('No PR found for this branch.');
    }

    if (checks) {
      const parsed = JSON.parse(checks) as Array<{ name: string; state: string }>;
      lines.push(`Checks: ${parsed.filter(c => c.state === 'SUCCESS').length}/${parsed.length} passing`);
      for (const c of parsed.slice(0, 10)) {
        const icon = c.state === 'SUCCESS' ? '\u2713' : c.state === 'FAILURE' ? '\u2717' : '\u2026';
        lines.push(`  ${icon} ${c.name}: ${c.state}`);
      }
    }

    return {
      data: {
        success: true,
        action: 'status',
        message: `PR status for ${currentBranch}`,
        data: lines.join('\n'),
      },
    };
  } catch (e: unknown) {
    return {
      data: {
        success: false,
        action: 'status',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }
}

// --- Tool definition ---

export const PrTool = buildTool({
  name: PR_TOOL_NAME,
  searchHint: PR_TOOL_SEARCH_HINT,
  maxResultSizeChars: 100_000,

  userFacingName() {
    return 'PR';
  },

  get inputSchema(): InputSchema {
    return inputSchema();
  },

  get outputSchema(): OutputSchema {
    return outputSchema();
  },

  shouldDefer: true,

  isEnabled() {
    return true;
  },

  isReadOnly(input: Input) {
    return input.action === 'list' || input.action === 'view' || input.action === 'status';
  },

  async description() {
    return DESCRIPTION;
  },

  async prompt() {
    return generatePrompt();
  },

  renderToolUseMessage,
  renderToolResultMessage,
  renderToolUseRejectedMessage,

  mapToolResultToToolResultBlockParam(content: Output, toolUseID: string) {
    return {
      type: 'tool_result' as const,
      tool_use_id: toolUseID,
      content: [content.message, content.data].filter(Boolean).join('\n'),
    };
  },

  async call(input: Input): Promise<{ data: Output }> {
    switch (input.action) {
      case 'create':
        return handleCreate();
      case 'list':
        return handleList();
      case 'view':
        return handleView(input.pr_number);
      case 'review':
        return handleReview(input.pr_number);
      case 'merge':
        return handleMerge(input.pr_number);
      case 'status':
        return handleStatus(input.branch);
    }
  },
});
