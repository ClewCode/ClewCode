import { z } from 'zod/v4';
import { buildTool, type ToolDef } from '../../Tool.js';
import type { PermissionUpdate } from '../../types/permissions.js';
import { lazySchema } from '../../utils/lazySchema.js';
import type { PermissionDecision } from '../../utils/permissions/PermissionResult.js';
import { getRuleByContentsForTool } from '../../utils/permissions/permissions.js';
import { isPreapprovedHost } from './preapproved.js';
import { DESCRIPTION, WEB_FETCH_TOOL_NAME } from './prompt.js';
import {
  getToolUseSummary,
  renderToolResultMessage,
  renderToolUseMessage,
  renderToolUseProgressMessage,
} from './UI.js';
import {
  applyPromptToMarkdown,
  type FetchedContent,
  getURLMarkdownContent,
  isPreapprovedUrl,
  MAX_MARKDOWN_LENGTH,
} from './utils.js';

const DEFAULT_PROMPT = 'Extract and summarize the main content';
const WEB_FETCH_TOTAL_TIMEOUT_MS = 15_000;
// Threshold below which we skip Haiku summarization and return raw content.
// Pages under this size are cheap enough to pass directly to the model.
const RAW_CONTENT_THRESHOLD = 50_000;

type FetchSingleUrlResult = {
  url: string;
  bytes: number;
  code: number;
  codeText: string;
  result: string;
  durationMs: number;
  error?: string;
};

function createChildAbortController(parentSignal: AbortSignal): AbortController {
  const child = new AbortController();
  if (parentSignal.aborted) {
    child.abort(parentSignal.reason);
    return child;
  }

  const abortChild = () => child.abort(parentSignal.reason);
  parentSignal.addEventListener('abort', abortChild, { once: true });
  child.signal.addEventListener('abort', () => parentSignal.removeEventListener('abort', abortChild), { once: true });
  return child;
}

async function withTimeout<T>(
  promise: Promise<T>,
  controller: AbortController,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort(message);
      reject(new Error(message));
    }, timeoutMs);
    if (typeof timeout === 'object' && 'unref' in timeout) {
      timeout.unref();
    }
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Helper function for single URL fetch
async function fetchSingleUrl(
  url: string,
  prompt: string,
  abortController: { signal: AbortSignal },
  isNonInteractiveSession: boolean,
): Promise<FetchSingleUrlResult> {
  const start = Date.now();
  const childAbortController = createChildAbortController(abortController.signal);

  try {
    const timeoutMessage = `WebFetch timed out after ${WEB_FETCH_TOTAL_TIMEOUT_MS / 1000}s`;
    const response = await withTimeout(
      getURLMarkdownContent(url, childAbortController),
      childAbortController,
      WEB_FETCH_TOTAL_TIMEOUT_MS,
      timeoutMessage,
    );

    if ('type' in response && response.type === 'redirect') {
      const statusText =
        response.statusCode === 301
          ? 'Moved Permanently'
          : response.statusCode === 308
            ? 'Permanent Redirect'
            : response.statusCode === 307
              ? 'Temporary Redirect'
              : 'Found';

      return {
        url,
        bytes: 0,
        code: response.statusCode,
        codeText: statusText,
        result: `REDIRECT: ${response.originalUrl} → ${response.redirectUrl}`,
        durationMs: Date.now() - start,
      };
    }

    const { content, bytes, code, codeText } = response as FetchedContent;

    // For reasonably-sized pages, skip the Haiku summarization pass and
    // return raw Markdown directly. The main model can process it more
    // accurately than a summary. Large pages still get summarized to
    // avoid consuming excessive context budget.
    let result: string;
    if (content.length <= RAW_CONTENT_THRESHOLD) {
      result = content.slice(0, MAX_MARKDOWN_LENGTH);
    } else {
      const elapsedMs = Date.now() - start;
      const remainingMs = Math.max(1, WEB_FETCH_TOTAL_TIMEOUT_MS - elapsedMs);
      const promptApplied = await withTimeout(
        applyPromptToMarkdown(
          prompt,
          content,
          childAbortController.signal,
          isNonInteractiveSession,
          isPreapprovedUrl(url),
        ),
        childAbortController,
        remainingMs,
        timeoutMessage,
      );
      result = promptApplied.slice(0, MAX_MARKDOWN_LENGTH);
    }

    return {
      url,
      bytes,
      code,
      codeText,
      result,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      url,
      bytes: 0,
      code: 0,
      codeText: 'Error',
      result: '',
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    childAbortController.abort('web_fetch_done');
  }
}

const inputSchema = lazySchema(() =>
  z
    .strictObject({
      url: z.string().url().optional().describe('Single URL to fetch (use urls for multiple)'),
      urls: z.array(z.string().url()).optional().describe('Multiple URLs to fetch in parallel (max 10)'),
      prompt: z
        .string()
        .optional()
        .default('Extract and summarize the main content')
        .describe('The prompt to run on the fetched content'),
    })
    .refine(data => data.url || data.urls, {
      message: 'Either url or urls must be provided',
    }),
);
type InputSchema = ReturnType<typeof inputSchema>;

const outputSchema = lazySchema(() =>
  z.object({
    results: z
      .array(
        z.object({
          url: z.string(),
          bytes: z.number(),
          code: z.number(),
          codeText: z.string(),
          result: z.string(),
          durationMs: z.number(),
          error: z.string().optional(),
        }),
      )
      .describe('Array of fetch results'),
    totalUrls: z.number(),
    successful: z.number(),
    failed: z.number(),
    totalDurationMs: z.number(),
  }),
);
type OutputSchema = ReturnType<typeof outputSchema>;

export type Output = z.infer<OutputSchema>;

function webFetchToolInputToPermissionRuleContent(input: { [k: string]: unknown }): string {
  try {
    const parsedInput = WebFetchTool.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      return `input:${input.toString()}`;
    }
    const { url } = parsedInput.data;
    const hostname = new URL(url).hostname;
    return `domain:${hostname}`;
  } catch {
    return `input:${input.toString()}`;
  }
}

export const WebFetchTool = buildTool({
  name: WEB_FETCH_TOOL_NAME,
  searchHint: 'fetch and extract content from a URL',
  // 100K chars - tool result persistence threshold
  maxResultSizeChars: 100_000,
  shouldDefer: true,
  async description(input) {
    const { url } = input as { url: string };
    try {
      const hostname = new URL(url).hostname;
      return `Claude wants to fetch content from ${hostname}`;
    } catch {
      return `Claude wants to fetch content from this URL`;
    }
  },
  userFacingName() {
    return 'Fetch';
  },
  getToolUseSummary,
  getActivityDescription(input) {
    const summary = getToolUseSummary(input);
    return summary ? `Fetching ${summary}` : 'Fetching web page';
  },
  get inputSchema(): InputSchema {
    return inputSchema();
  },
  get outputSchema(): OutputSchema {
    return outputSchema();
  },
  isConcurrencySafe() {
    return true;
  },
  isReadOnly() {
    return true;
  },
  toAutoClassifierInput(input) {
    return input.prompt ? `${input.url}: ${input.prompt}` : input.url;
  },
  async checkPermissions(input, context): Promise<PermissionDecision> {
    const appState = context.getAppState();
    const permissionContext = appState.toolPermissionContext;

    // Check if the hostname is in the preapproved list
    try {
      const { url } = input as { url: string };
      const parsedUrl = new URL(url);
      if (isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname)) {
        return {
          behavior: 'allow',
          updatedInput: input,
          decisionReason: { type: 'other', reason: 'Preapproved host' },
        };
      }
    } catch {
      // If URL parsing fails, continue with normal permission checks
    }

    // Check for a rule specific to the tool input (matching hostname)
    const ruleContent = webFetchToolInputToPermissionRuleContent(input);

    const denyRule = getRuleByContentsForTool(permissionContext, WebFetchTool, 'deny').get(ruleContent);
    if (denyRule) {
      return {
        behavior: 'deny',
        message: `${WebFetchTool.name} denied access to ${ruleContent}.`,
        decisionReason: {
          type: 'rule',
          rule: denyRule,
        },
      };
    }

    const askRule = getRuleByContentsForTool(permissionContext, WebFetchTool, 'ask').get(ruleContent);
    if (askRule) {
      return {
        behavior: 'ask',
        message: `Claude requested permissions to use ${WebFetchTool.name}, but you haven't granted it yet.`,
        decisionReason: {
          type: 'rule',
          rule: askRule,
        },
        suggestions: buildSuggestions(ruleContent),
      };
    }

    const allowRule = getRuleByContentsForTool(permissionContext, WebFetchTool, 'allow').get(ruleContent);
    if (allowRule) {
      return {
        behavior: 'allow',
        updatedInput: input,
        decisionReason: {
          type: 'rule',
          rule: allowRule,
        },
      };
    }

    return {
      behavior: 'ask',
      message: `Claude requested permissions to use ${WebFetchTool.name}, but you haven't granted it yet.`,
      suggestions: buildSuggestions(ruleContent),
    };
  },
  async prompt(_options) {
    // Always include the auth warning regardless of whether ToolSearch is
    // currently in the tools list. Conditionally toggling this prefix based
    // on ToolSearch availability caused the tool description to flicker
    // between SDK query() calls (when ToolSearch enablement varies due to
    // MCP tool count thresholds), invalidating the Anthropic API prompt
    // cache on each toggle — two consecutive cache misses per flicker event.
    return `IMPORTANT: WebFetch WILL FAIL for authenticated or private URLs. Before using this tool, check if the URL points to an authenticated service (e.g. Google Docs, Confluence, Jira, GitHub). If so, look for a specialized MCP tool that provides authenticated access.
${DESCRIPTION}`;
  },
  async validateInput(input) {
    const { url, urls } = input;
    if (url) {
      try {
        new URL(url);
      } catch {
        return {
          result: false,
          message: `Error: Invalid URL "${url}". The URL provided could not be parsed.`,
          meta: { reason: 'invalid_url' },
          errorCode: 1,
        };
      }
    }
    if (urls) {
      if (urls.length > 10) {
        return {
          result: false,
          message: `Error: Maximum 10 URLs allowed, got ${urls.length}`,
          meta: { reason: 'too_many_urls' },
          errorCode: 2,
        };
      }
      for (const u of urls) {
        try {
          new URL(u);
        } catch {
          return {
            result: false,
            message: `Error: Invalid URL "${u}". The URL provided could not be parsed.`,
            meta: { reason: 'invalid_url' },
            errorCode: 1,
          };
        }
      }
    }
    return { result: true };
  },
  renderToolUseMessage,
  renderToolUseProgressMessage,
  renderToolResultMessage,
  async call({ url, urls, prompt }, { abortController, options: { isNonInteractiveSession } }) {
    const start = Date.now();
    const urlsToFetch = urls || (url ? [url] : []);
    const maxUrls = 10;
    const limitedUrls = urlsToFetch.slice(0, maxUrls);

    // Fetch through one normalized output shape so single and multi URL calls
    // share timeout/error handling and result rendering.
    const fetchPromises = limitedUrls.map(u =>
      fetchSingleUrl(u, prompt || DEFAULT_PROMPT, abortController, isNonInteractiveSession).catch(err => ({
        url: u,
        bytes: 0,
        code: 0,
        codeText: 'Error',
        result: '',
        durationMs: 0,
        error: err.message || 'Fetch failed',
      })),
    );

    const results = await Promise.all(fetchPromises);

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    const totalDurationMs = Date.now() - start;

    const output: Output = {
      results: results.map(r => ({
        url: r.url,
        bytes: r.bytes,
        code: r.code,
        codeText: r.codeText,
        result: r.result,
        durationMs: r.durationMs,
        error: r.error,
      })),
      totalUrls: limitedUrls.length,
      successful,
      failed,
      totalDurationMs,
    };

    return { data: output };
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    const lines = [`Fetched ${output.totalUrls} URLs (${output.successful} successful, ${output.failed} failed):\n`];
    for (const r of output.results) {
      lines.push(`## ${r.url}`);
      lines.push(`Status: ${r.code} ${r.codeText}`);
      if (r.error) {
        lines.push(`Error: ${r.error}`);
      } else {
        lines.push(r.result.slice(0, 8_000));
        if (r.result.length > 8_000) lines.push(`... (${r.result.length - 8_000} more chars)`);
      }
      lines.push('');
    }

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    };
  },
} satisfies ToolDef<InputSchema, Output>);

function buildSuggestions(ruleContent: string): PermissionUpdate[] {
  return [
    {
      type: 'addRules',
      destination: 'localSettings',
      rules: [{ toolName: WEB_FETCH_TOOL_NAME, ruleContent }],
      behavior: 'allow',
    },
  ];
}
