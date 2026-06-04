/**
 * AgentPRStatus — Detect and track pull request status for background agent sessions.
 *
 * Scans recent agent messages for PR creation patterns (gh pr create, GitHub API)
 * and maps status to the official Clew Code color scheme:
 * - Yellow: waiting on checks/review, or checks failed
 * - Green: checks passed, no review blocking
 * - Purple: merged
 * - Grey: draft or closed
 */

import type { PRStatus } from '../../components/agents/AgentViewRow.js';
import type { LocalAgentTaskState } from '../../tasks/LocalAgentTask/LocalAgentTask.js';

// Patterns to detect PR creation
const PR_CREATION_PATTERNS = [
  // gh pr create output
  /Created pull request (?:#(\d+)|(\S+))\s*(?:at\s+)?(https:\/\/[^\s]+\/pull\/\d+)?/i,
  // GitHub API create PR response
  /"html_url"\s*:\s*"(https:\/\/[^\s]+\/pull\/(\d+))"/i,
  // Generic PR URL mention in output
  /(https:\/\/[^\s/]+\/[^\s/]+\/[^\s/]+\/pull\/(\d+))/i,
];

// Patterns to detect PR status from agent messages
const PR_MERGED_PATTERN = /merged|merge (?:was|has been|completed)/i;
const PR_CLOSED_PATTERN = /closed (?:without|the) (?:merge|PR)|closing (?:this|the) PR/i;
const PR_DRAFT_PATTERN = /draft|marked as draft/i;
const PR_CHECKS_FAILED_PATTERN = /checks? (?:failed|are failing)|CI (?:failed|is failing)/i;
const PR_CHECKS_PASSED_PATTERN = /checks? (?:passed|are passing|green)|CI (?:passed|is green)|ready to merge/i;

export interface PRInfo {
  url: string;
  number: number;
  status: PRStatus;
  firstSeenAt: number;
  lastCheckedAt: number;
}

/**
 * Scan agent messages for PR URLs and creation events.
 * Returns PR info if found, null otherwise.
 */
export function scanMessagesForPR(task: LocalAgentTaskState): PRInfo | null {
  const messages = task.messages ?? [];
  const existing: PRInfo | undefined = (task as any)._prInfo;

  // Check existing PR info first
  if (existing) {
    // Re-scan to update status
    const updated = updatePRStatus(existing, messages);
    return updated;
  }

  // Scan for PR creation
  const creationText = extractRecentText(messages, 50);
  for (const pattern of PR_CREATION_PATTERNS) {
    const match = creationText.match(pattern);
    if (match) {
      const prUrl = match[2] ?? match[3];
      const prNumberStr = match[1] ?? match[4];
      if (prUrl && prNumberStr) {
        const prNumber = parseInt(prNumberStr, 10);
        if (!isNaN(prNumber)) {
          return {
            url: prUrl,
            number: prNumber,
            status: 'pending_checks',
            firstSeenAt: Date.now(),
            lastCheckedAt: Date.now(),
          };
        }
      }
    }
  }

  // Check for existing PR URL in any message content
  for (const msg of messages) {
    const text = extractMessageText(msg);
    for (const pattern of PR_CREATION_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const prUrl = match[0];
        const prNumber = parseInt(match[1], 10);
        if (!isNaN(prNumber) && prUrl.includes('pull')) {
          return {
            url: prUrl,
            number: prNumber,
            status: 'pending_checks',
            firstSeenAt: Date.now(),
            lastCheckedAt: Date.now(),
          };
        }
      }
    }
  }

  return null;
}

function updatePRStatus(existing: PRInfo, messages: any[]): PRInfo {
  const recentText = extractRecentText(messages, 30);

  let newStatus: PRStatus = existing.status;

  if (PR_MERGED_PATTERN.test(recentText)) {
    newStatus = 'merged';
  } else if (PR_CLOSED_PATTERN.test(recentText)) {
    newStatus = 'closed';
  } else if (PR_DRAFT_PATTERN.test(recentText)) {
    newStatus = 'draft';
  } else if (PR_CHECKS_FAILED_PATTERN.test(recentText)) {
    newStatus = 'checks_failed';
  } else if (PR_CHECKS_PASSED_PATTERN.test(recentText)) {
    newStatus = 'checks_passed';
  }

  return {
    ...existing,
    status: newStatus,
    lastCheckedAt: Date.now(),
  };
}

function extractMessageText(msg: any): string {
  if (typeof msg === 'string') return msg;
  if (msg.message?.content) {
    if (Array.isArray(msg.message.content)) {
      return msg.message.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join(' ');
    }
    if (typeof msg.message.content === 'string') {
      return msg.message.content;
    }
  }
  if (msg.content) {
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join(' ');
    }
  }
  return '';
}

function extractRecentText(messages: any[], count: number): string {
  return messages.slice(-count).map(extractMessageText).join(' ');
}

/**
 * Check and update PR status for a task. Call periodically.
 * Returns updated PRInfo or null if no PR found.
 */
export function refreshPRStatus(task: LocalAgentTaskState): PRInfo | null {
  return scanMessagesForPR(task);
}
