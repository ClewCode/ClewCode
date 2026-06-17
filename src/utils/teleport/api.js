import axios from 'axios';
import { randomUUID } from 'crypto';
import { getOauthConfig } from 'src/constants/oauth.js';
import { getOrganizationUUID } from 'src/services/oauth/client.js';
import z from 'zod/v4';
import { getClaudeAIOAuthTokens } from '../auth.js';
import { logForDebugging } from '../debug.js';
import { parseGitHubRepository } from '../detectRepository.js';
import { errorMessage, toError } from '../errors.js';
import { lazySchema } from '../lazySchema.js';
import { logError } from '../log.js';
import { sleep } from '../sleep.js';
import { jsonStringify } from '../slowOperations.js';

// Retry configuration for teleport API requests
const TELEPORT_RETRY_DELAYS = [2000, 4000, 8000, 16000]; // 4 retries with exponential backoff
const MAX_TELEPORT_RETRIES = TELEPORT_RETRY_DELAYS.length;
export const CCR_BYOC_BETA = 'ccr-byoc-2025-07-29';
/**
 * Checks if an axios error is a transient network error that should be retried
 */
export function isTransientNetworkError(error) {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  // Retry on network errors (no response received)
  if (!error.response) {
    return true;
  }
  // Retry on server errors (5xx)
  if (error.response.status >= 500) {
    return true;
  }
  // Don't retry on client errors (4xx) - they're not transient
  return false;
}
/**
 * Makes an axios GET request with automatic retry for transient network errors
 * Uses exponential backoff: 2s, 4s, 8s, 16s (4 retries = 5 total attempts)
 */
export async function axiosGetWithRetry(url, config) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_TELEPORT_RETRIES; attempt++) {
    try {
      return await axios.get(url, config);
    } catch (error) {
      lastError = error;
      // Don't retry if this isn't a transient error
      if (!isTransientNetworkError(error)) {
        throw error;
      }
      // Don't retry if we've exhausted all retries
      if (attempt >= MAX_TELEPORT_RETRIES) {
        logForDebugging(`Teleport request failed after ${attempt + 1} attempts: ${errorMessage(error)}`);
        throw error;
      }
      const delay = TELEPORT_RETRY_DELAYS[attempt] ?? 2000;
      logForDebugging(
        `Teleport request failed (attempt ${attempt + 1}/${MAX_TELEPORT_RETRIES + 1}), retrying in ${delay}ms: ${errorMessage(error)}`,
      );
      await sleep(delay);
    }
  }
  throw lastError;
}
export const CodeSessionSchema = lazySchema(() =>
  z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['idle', 'working', 'waiting', 'completed', 'archived', 'cancelled', 'rejected']),
    repo: z
      .object({
        name: z.string(),
        owner: z.object({
          login: z.string(),
        }),
        default_branch: z.string().optional(),
      })
      .nullable(),
    turns: z.array(z.string()),
    created_at: z.string(),
    updated_at: z.string(),
  }),
);
/**
 * Validates and prepares for API requests
 * @returns Object containing access token and organization UUID
 */
export async function prepareApiRequest() {
  const accessToken = getClaudeAIOAuthTokens()?.accessToken;
  if (accessToken === undefined) {
    throw new Error(
      'Clew Code web sessions require authentication with a Claude.ai account. API key authentication is not sufficient. Please run /login to authenticate, or check your authentication status with /status.',
    );
  }
  const orgUUID = await getOrganizationUUID();
  if (!orgUUID) {
    throw new Error('Unable to get organization UUID');
  }
  return { accessToken, orgUUID };
}
/**
 * Fetches code sessions from the new Sessions API (/v1/sessions)
 * @returns Array of code sessions
 */
export async function fetchCodeSessionsFromSessionsAPI() {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions`;
  try {
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    };
    const response = await axiosGetWithRetry(url, {
      headers,
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch code sessions: ${response.statusText}`);
    }
    // Transform SessionResource[] to CodeSession[] format
    const sessions = response.data.data.map(session => {
      // Extract repository info from git sources
      const gitSource = session.session_context.sources.find(source => source.type === 'git_repository');
      let repo = null;
      if (gitSource?.url) {
        // Parse GitHub URL using the existing utility function
        const repoPath = parseGitHubRepository(gitSource.url);
        if (repoPath) {
          const [owner, name] = repoPath.split('/');
          if (owner && name) {
            repo = {
              name,
              owner: {
                login: owner,
              },
              default_branch: gitSource.revision || undefined,
            };
          }
        }
      }
      return {
        id: session.id,
        title: session.title || 'Untitled',
        description: '', // SessionResource doesn't have description field
        status: session.session_status, // Map session_status to status
        repo,
        turns: [], // SessionResource doesn't have turns field
        created_at: session.created_at,
        updated_at: session.updated_at,
      };
    });
    return sessions;
  } catch (error) {
    const err = toError(error);
    logError(err);
    throw error;
  }
}
/**
 * Creates OAuth headers for API requests
 * @param accessToken The OAuth access token
 * @returns Headers object with Authorization, Content-Type, and anthropic-version
 */
export function getOAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
}
/**
 * Fetches a single session by ID from the Sessions API
 * @param sessionId The session ID to fetch
 * @returns The session resource
 */
export async function fetchSession(sessionId) {
  const { accessToken, orgUUID } = await prepareApiRequest();
  const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`;
  const headers = {
    ...getOAuthHeaders(accessToken),
    'anthropic-beta': 'ccr-byoc-2025-07-29',
    'x-organization-uuid': orgUUID,
  };
  const response = await axios.get(url, {
    headers,
    timeout: 15000,
    validateStatus: status => status < 500,
  });
  if (response.status !== 200) {
    // Extract error message from response if available
    const errorData = response.data;
    const apiMessage = errorData?.error?.message;
    if (response.status === 404) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (response.status === 401) {
      throw new Error('Session expired. Please run /login to sign in again.');
    }
    throw new Error(apiMessage || `Failed to fetch session: ${response.status} ${response.statusText}`);
  }
  return response.data;
}
/**
 * Extracts the first branch name from a session's git repository outcomes
 * @param session The session resource to extract from
 * @returns The first branch name, or undefined if none found
 */
export function getBranchFromSession(session) {
  const gitOutcome = session.session_context.outcomes?.find(outcome => outcome.type === 'git_repository');
  return gitOutcome?.git_info?.branches[0];
}
/**
 * Sends a user message event to an existing remote session via the Sessions API
 * @param sessionId The session ID to send the event to
 * @param messageContent The user message content (string or content blocks)
 * @param opts.uuid Optional UUID for the event — callers that added a local
 *   UserMessage first should pass its UUID so echo filtering can dedup
 * @returns Promise<boolean> True if successful, false otherwise
 */
export async function sendEventToRemoteSession(sessionId, messageContent, opts) {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}/events`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    };
    const userEvent = {
      uuid: opts?.uuid ?? randomUUID(),
      session_id: sessionId,
      type: 'user',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content: messageContent,
      },
    };
    const requestBody = {
      events: [userEvent],
    };
    logForDebugging(`[sendEventToRemoteSession] Sending event to session ${sessionId}`);
    // The endpoint may block until the CCR worker is ready. Observed ~2.6s
    // in normal cases; allow a generous margin for cold-start containers.
    const response = await axios.post(url, requestBody, {
      headers,
      validateStatus: status => status < 500,
      timeout: 30000,
    });
    if (response.status === 200 || response.status === 201) {
      logForDebugging(`[sendEventToRemoteSession] Successfully sent event to session ${sessionId}`);
      return true;
    }
    logForDebugging(
      `[sendEventToRemoteSession] Failed with status ${response.status}: ${jsonStringify(response.data)}`,
    );
    return false;
  } catch (error) {
    logForDebugging(`[sendEventToRemoteSession] Error: ${errorMessage(error)}`);
    return false;
  }
}
/**
 * Updates the title of an existing remote session via the Sessions API
 * @param sessionId The session ID to update
 * @param title The new title for the session
 * @returns Promise<boolean> True if successful, false otherwise
 */
export async function updateSessionTitle(sessionId, title) {
  try {
    const { accessToken, orgUUID } = await prepareApiRequest();
    const url = `${getOauthConfig().BASE_API_URL}/v1/sessions/${sessionId}`;
    const headers = {
      ...getOAuthHeaders(accessToken),
      'anthropic-beta': 'ccr-byoc-2025-07-29',
      'x-organization-uuid': orgUUID,
    };
    logForDebugging(`[updateSessionTitle] Updating title for session ${sessionId}: "${title}"`);
    const response = await axios.patch(
      url,
      { title },
      {
        headers,
        validateStatus: status => status < 500,
      },
    );
    if (response.status === 200) {
      logForDebugging(`[updateSessionTitle] Successfully updated title for session ${sessionId}`);
      return true;
    }
    logForDebugging(`[updateSessionTitle] Failed with status ${response.status}: ${jsonStringify(response.data)}`);
    return false;
  } catch (error) {
    logForDebugging(`[updateSessionTitle] Error: ${errorMessage(error)}`);
    return false;
  }
}
