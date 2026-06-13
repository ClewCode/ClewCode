/**
 * `/pr` slash command — full GitHub PR lifecycle management.
 *
 * Subcommands:
 *   create          Create a PR from current branch (via gh pr create)
 *   list            List open PRs
 *   view <id>       Show PR details
 *   review <id>     Fetch diff + auto-review with AI
 *   merge <id>      Merge a PR
 *   status          CI status of current PR
 */

import { execSync } from 'node:child_process';
import type { LocalCommandResult, LocalJSXCommandContext } from '../../types/command.js';

export async function call(args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> {
  const trimmed = args.trim();
  const [verb, ...rest] = trimmed.split(/\s+/) as [string, ...string[]];

  switch (verb) {
    case 'create':
      return handleCreate();
    case 'list':
      return handleList();
    case 'view':
      return handleView(rest[0] ?? '');
    case 'review':
      return handleReview(rest[0] ?? '');
    case 'merge':
      return handleMerge(rest[0] ?? '');
    case 'status':
      return handleStatus();
    default:
      return { type: 'text', value: HELP_TEXT };
  }
}

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

// ─── create ─────────────────────────────────────────────────────────────

async function handleCreate(): Promise<LocalCommandResult> {
  try {
    const branch = gh('branch --show-current');
    const title = ghSafe('pr view --json title --jq .title') || `Changes on ${branch}`;
    const body = ghSafe('pr view --json body --jq .body') || '';

    const result = gh(
      `pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"').slice(0, 2000)}" --fill`,
    );
    const url = result.match(/https:\/\/github\.com\/\S+/) ? result : ghSafe('pr view --json url --jq .url');

    return { type: 'text', value: `◈ pr · created\n  Branch: ${branch}\n  URL: ${url || result}` };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · create failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── list ────────────────────────────────────────────────────────────────

async function handleList(): Promise<LocalCommandResult> {
  try {
    const json = gh(
      'pr list --state open --limit 20 --json number,title,headRefName,author,createdAt,mergeable,reviews',
    );
    if (!json) return { type: 'text', value: '◈ pr · no open PRs.' };
    const prs = JSON.parse(json) as Array<{
      number: number;
      title: string;
      headRefName: string;
    }>;
    if (prs.length === 0) return { type: 'text', value: '◈ pr · no open PRs.' };
    const lines = prs.map(pr => `#${pr.number} ${pr.title} (${pr.headRefName})`);
    return { type: 'text', value: `◈ pr · open PRs:\n${lines.map(l => `  ${l}`).join('\n')}` };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · list failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── view ────────────────────────────────────────────────────────────────

async function handleView(prId: string): Promise<LocalCommandResult> {
  if (!prId) return { type: 'text', value: 'Usage: /pr view <number>' };
  try {
    const info = gh(
      `pr view ${prId} --json number,title,state,headRefName,baseRefName,author,createdAt,mergeable,additions,deletions,files,reviews,body,url`,
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
      `◈ PR #${data.number}: ${data.title}`,
      `  State:   ${data.state}  Mergeable: ${data.mergeable}`,
      `  Branch:  ${data.headRefName} → ${data.baseRefName}`,
      `  Author:  ${data.author.login}  Created: ${data.createdAt.slice(0, 10)}`,
      `  Changes: +${data.additions}/-${data.deletions}  Files: ${data.files?.length ?? 0}`,
      `  URL:     ${data.url}`,
    ];
    if (data.reviews?.length) {
      lines.push(`  Reviews: ${data.reviews.filter(r => r.state === 'APPROVED').length} approved`);
    }
    if (data.body) {
      lines.push(`\n  Description: ${data.body.slice(0, 300)}${data.body.length > 300 ? '…' : ''}`);
    }
    return { type: 'text', value: lines.join('\n') };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · view failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── review ──────────────────────────────────────────────────────────────

async function handleReview(prId: string): Promise<LocalCommandResult> {
  if (!prId) return { type: 'text', value: 'Usage: /pr review <number>' };
  try {
    const diff = gh(`pr diff ${prId}`);
    const info = JSON.parse(gh(`pr view ${prId} --json title,body`)) as { title: string; body?: string };

    // Build review prompt — the model will review the diff
    const prompt = `Review this PR and identify any bugs, security issues, or logic errors.

PR #${prId}: ${info.title}
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

    // Return as a prompt for the model to process (not text)
    return {
      type: 'text',
      value: `◈ pr · reviewing #${prId}\n\n${prompt}\n\n---\n/effort high\n\nReview the PR diff above. Be thorough and specific.`,
    };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · review failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── merge ───────────────────────────────────────────────────────────────

async function handleMerge(prId: string): Promise<LocalCommandResult> {
  if (!prId) return { type: 'text', value: 'Usage: /pr merge <number>' };
  try {
    const result = gh(`pr merge ${prId} --merge --subject "Merge PR #${prId}"`);
    return { type: 'text', value: `◈ pr · merged #${prId}\n  ${result}` };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · merge failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── status ──────────────────────────────────────────────────────────────

async function handleStatus(): Promise<LocalCommandResult> {
  try {
    const branch = gh('branch --show-current');
    const prInfo = ghSafe(`pr view --json number,title,state,mergeable,reviews`);
    const checks = ghSafe('pr checks --limit 10 --json name,state,branch');

    const lines = [`◈ pr · status for ${branch}`];

    if (prInfo) {
      const parsed = JSON.parse(prInfo) as { number: number; title: string; state: string };
      lines.push(`  PR #${parsed.number}: ${parsed.title} [${parsed.state}]`);
    } else {
      lines.push('  No PR found for this branch.');
    }

    if (checks) {
      const parsed = JSON.parse(checks) as Array<{ name: string; state: string }>;
      lines.push(`  Checks: ${parsed.filter(c => c.state === 'SUCCESS').length}/${parsed.length} passing`);
      for (const c of parsed.slice(0, 10)) {
        const icon = c.state === 'SUCCESS' ? '✓' : c.state === 'FAILURE' ? '✗' : '…';
        lines.push(`    ${icon} ${c.name}: ${c.state}`);
      }
    }

    return { type: 'text', value: lines.join('\n') };
  } catch (e: unknown) {
    return { type: 'text', value: `◈ pr · status failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

const HELP_TEXT = `◈ pr — GitHub Pull Request management

Subcommands:
  create            Create PR from current branch
  list              List open PRs
  view <number>     Show PR details
  review <number>   Fetch diff for AI review
  merge <number>    Merge a PR
  status            CI status of current PR

Examples:
  /pr create
  /pr list
  /pr view 42
  /pr review 42
  /pr merge 42
  /pr status`;
