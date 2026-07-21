import { LRUCache } from 'lru-cache';
import { ofetch } from 'ofetch';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js';
import { queryHaiku } from '../../services/api/claude.js';
import { logForDiagnosticsNoPII } from '../../utils/diagLogs.js';
import { AbortError, isFetchError } from '../../utils/errors.js';
import { getWebFetchUserAgent } from '../../utils/http.js';
import { logError } from '../../utils/log.js';
import { isBinaryContentType, persistBinaryContent } from '../../utils/mcpOutputStorage.js';
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js';
import { asSystemPrompt } from '../../utils/systemPromptType.js';
import { isPreapprovedHost } from './preapproved.js';
import { makeSecondaryModelPrompt } from './prompt.js';

// Custom error classes for domain blocking
class DomainBlockedError extends Error {
  constructor(domain: string) {
    super(`Clew Code is unable to fetch from ${domain}`);
    this.name = 'DomainBlockedError';
  }
}

class DomainCheckFailedError extends Error {
  constructor(domain: string) {
    super(
      `Unable to verify if domain ${domain} is safe to fetch. This may be due to network restrictions or enterprise security policies blocking claude.ai.`,
    );
    this.name = 'DomainCheckFailedError';
  }
}

class EgressBlockedError extends Error {
  constructor(public readonly domain: string) {
    super(
      JSON.stringify({
        error_type: 'EGRESS_BLOCKED',
        domain,
        message: `Access to ${domain} is blocked by the network egress proxy.`,
      }),
    );
    this.name = 'EgressBlockedError';
  }
}

// Cache for storing fetched URL content
type CacheEntry = {
  bytes: number;
  code: number;
  codeText: string;
  content: string;
  contentType: string;
  persistedPath?: string;
  persistedSize?: number;
};

// Cache with 15-minute TTL and 50MB size limit
// LRUCache handles automatic expiration and eviction
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const URL_CACHE = new LRUCache<string, CacheEntry>({
  maxSize: MAX_CACHE_SIZE_BYTES,
  ttl: CACHE_TTL_MS,
});

// Separate cache for preflight domain checks. URL_CACHE is URL-keyed, so
// fetching two paths on the same domain triggers two identical preflight
// HTTP round-trips to api.anthropic.com. This hostname-keyed cache avoids
// that. Only 'allowed' is cached — blocked/failed re-check on next attempt.
const DOMAIN_CHECK_CACHE = new LRUCache<string, true>({
  max: 128,
  ttl: 5 * 60 * 1000, // 5 minutes — shorter than URL_CACHE TTL
});

export function clearWebFetchCache(): void {
  URL_CACHE.clear();
  DOMAIN_CHECK_CACHE.clear();
}

// Lazy singleton — defers the turndown → @mixmark-io/domino import (~1.4MB
// retained heap) until the first HTML fetch, and reuses one instance across
// calls (construction builds 15 rule objects; .turndown() is stateless).
// @types/turndown ships only `export =` (no .d.mts), so TS types the import
// as the class itself while Bun wraps CJS in { default } — hence the cast.
type TurndownCtor = typeof import('turndown');
let turndownServicePromise: Promise<InstanceType<TurndownCtor>> | undefined;
function getTurndownService(): Promise<InstanceType<TurndownCtor>> {
  return (turndownServicePromise ??= import('turndown').then(m => {
    const Turndown = (m as unknown as { default: TurndownCtor }).default;
    const service = new Turndown();
    // Remove style and script tags before conversion to prevent CSS-heavy
    // pages from exhausting the content budget before reaching actual text
    service.remove(['style', 'script']);
    return service;
  }));
}

/**
 * Strip <style> and <script> tags from HTML content.
 * CSS-heavy pages can exhaust the content budget before reaching actual text.
 */
function stripStyleScriptTags(html: string): string {
  // Remove <style>...</style> tags (case-insensitive, handles multiline)
  html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove <script>...</script> tags (case-insensitive, handles multiline)
  html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  return html;
}

// PSR requested limiting the length of URLs to 250 to lower the potential
// for a data exfiltration. However, this is too restrictive for some customers'
// legitimate use cases, such as JWT-signed URLs (e.g., cloud service signed URLs)
// that can be much longer. We already require user approval for each domain,
// which provides a primary security boundary. In addition, Clew Code has
// other data exfil channels, and this one does not seem relatively high risk,
// so I'm removing that length restriction. -ab
const MAX_URL_LENGTH = 2000;

// Per PSR:
// "Implement resource consumption controls because setting limits on CPU,
// memory, and network usage for the Web Fetch tool can prevent a single
// request or user from overwhelming the system."
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024;

// Timeout for the main HTTP fetch request (60 seconds).
// Prevents hanging indefinitely on slow/unresponsive servers.
const FETCH_TIMEOUT_MS = 60_000;

// Timeout for the domain blocklist preflight check (10 seconds).
const DOMAIN_CHECK_TIMEOUT_MS = 10_000;

// Cap same-host redirect hops. Without this a malicious server can return
// a redirect loop (/a → /b → /a …) and the per-request FETCH_TIMEOUT_MS
// resets on every hop, hanging the tool until user interrupt. 10 matches
// common client defaults (axios=5, follow-redirects=21, Chrome=20).
const MAX_REDIRECTS = 10;

// Truncate to not spend too many tokens
export const MAX_MARKDOWN_LENGTH = 100_000;

export function isPreapprovedUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return isPreapprovedHost(parsedUrl.hostname, parsedUrl.pathname);
  } catch {
    return false;
  }
}

// BUG (SSRF): private/reserved IPv4 ranges and the cloud metadata endpoint.
// A bare IP literal like 169.254.169.254 or 127.0.0.1 has >= 2 dot-separated
// parts, so it previously passed the "publicly resolvable"-looking check
// below undetected. This does NOT protect against DNS rebinding (a hostname
// that resolves to a private IP at connect time) — that requires resolving
// and pinning the IP before the request, which is a larger change — but it
// closes the direct IP-literal bypass.
function isPrivateOrReservedIPv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1, 5).map(Number);
  if (octets.some(o => o > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
  if (a === 172 && b! >= 16 && b! <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

function isPrivateOrReservedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (lower === '[::1]' || lower === '::1') return true; // IPv6 loopback
  if (lower.startsWith('[fe80:') || lower.startsWith('fe80:')) return true; // IPv6 link-local
  if (lower.startsWith('[fc') || lower.startsWith('[fd')) return true; // IPv6 unique local
  return isPrivateOrReservedIPv4(hostname);
}

export function validateURL(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) {
    return false;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // We don't need to check protocol here, as we'll upgrade http to https when making the request

  // As long as we aren't supporting aiming to cookies or internal domains,
  // we should block URLs with usernames/passwords too, even though these
  // seem exceedingly unlikely.
  if (parsed.username || parsed.password) {
    return false;
  }

  // Initial filter that this isn't a privileged, company-internal URL
  // by checking that the hostname is publicly resolvable
  const hostname = parsed.hostname;
  if (isPrivateOrReservedHostname(hostname)) {
    return false;
  }
  const parts = hostname.split('.');
  if (parts.length < 2) {
    return false;
  }

  return true;
}

type DomainCheckResult = { status: 'allowed' } | { status: 'blocked' } | { status: 'check_failed'; error: Error };

export async function checkDomainBlocklist(domain: string): Promise<DomainCheckResult> {
  if (DOMAIN_CHECK_CACHE.has(domain)) {
    return { status: 'allowed' };
  }
  try {
    const response = await ofetch(
      `https://api.anthropic.com/api/web/domain_info?domain=${encodeURIComponent(domain)}`,
      { timeout: DOMAIN_CHECK_TIMEOUT_MS },
    );
    if (response.status === 200) {
      if (response.data.can_fetch === true) {
        DOMAIN_CHECK_CACHE.set(domain, true);
        return { status: 'allowed' };
      }
      return { status: 'blocked' };
    }
    // Non-200 status but didn't throw
    return {
      status: 'check_failed',
      error: new Error(`Domain check returned status ${response.status}`),
    };
  } catch (e) {
    logError(e);
    return { status: 'check_failed', error: e as Error };
  }
}

/**
 * Check if a redirect is safe to follow
 * Allows redirects that:
 * - Add or remove "www." in the hostname
 * - Keep the origin the same but change path/query params
 * - Or both of the above
 */
export function isPermittedRedirect(originalUrl: string, redirectUrl: string): boolean {
  try {
    const parsedOriginal = new URL(originalUrl);
    const parsedRedirect = new URL(redirectUrl);

    if (parsedRedirect.protocol !== parsedOriginal.protocol) {
      return false;
    }

    if (parsedRedirect.port !== parsedOriginal.port) {
      return false;
    }

    if (parsedRedirect.username || parsedRedirect.password) {
      return false;
    }

    // Now check hostname conditions
    // 1. Adding www. is allowed: example.com -> www.example.com
    // 2. Removing www. is allowed: www.example.com -> example.com
    // 3. Same host (with or without www.) is allowed: paths can change
    const stripWww = (hostname: string) => hostname.replace(/^www\./, '');
    const originalHostWithoutWww = stripWww(parsedOriginal.hostname);
    const redirectHostWithoutWww = stripWww(parsedRedirect.hostname);
    return originalHostWithoutWww === redirectHostWithoutWww;
  } catch (_error) {
    return false;
  }
}

/**
 * Helper function to handle fetching URLs with custom redirect handling
 * Recursively follows redirects if they pass the redirectChecker function
 *
 * Per PSR:
 * "Do not automatically follow redirects because following redirects could
 * allow for an attacker to exploit an open redirect vulnerability in a
 * trusted domain to force a user to make a request to a malicious domain
 * unknowingly"
 */
type RedirectInfo = {
  type: 'redirect';
  originalUrl: string;
  redirectUrl: string;
  statusCode: number;
};

export async function getWithPermittedRedirects(
  url: string,
  signal: AbortSignal,
  redirectChecker: (originalUrl: string, redirectUrl: string) => boolean,
  depth = 0,
): Promise<Response | RedirectInfo> {
  if (depth > MAX_REDIRECTS) {
    throw new Error(`Too many redirects (exceeded ${MAX_REDIRECTS})`);
  }
  try {
    // BUG (SSRF): `maxRedirects` is not a real fetch/ofetch option — ofetch
    // spreads unrecognized options straight into native fetch(), which
    // silently ignores it and defaults to redirect: 'follow'. That made the
    // redirectChecker below unreachable dead code: every redirect (including
    // ones pointing at 169.254.169.254 or other private/internal addresses)
    // was auto-followed by the runtime before ofetch ever saw a 3xx status.
    // `redirect: 'manual'` is the real native-fetch option that prevents
    // auto-following.
    const response = await ofetch.raw(url, {
      signal,
      timeout: FETCH_TIMEOUT_MS,
      redirect: 'manual',
      responseType: 'arrayBuffer',
      headers: {
        Accept: 'text/markdown, text/html, */*',
        'User-Agent': getWebFetchUserAgent(),
      },
    });

    // BUG (resource exhaustion): `maxContentLength` is likewise not a real
    // fetch/ofetch option and was silently ignored — the entire body was
    // buffered via arrayBuffer() with no cap. Enforce the limit manually
    // now that the response has been read.
    const bodyLength = (response as unknown as { _data?: ArrayBuffer })._data?.byteLength ?? 0;
    if (bodyLength > MAX_HTTP_CONTENT_LENGTH) {
      throw new Error(`Response body exceeded maximum content length (${MAX_HTTP_CONTENT_LENGTH} bytes)`);
    }

    // With redirect: 'manual', a 3xx response is returned as a normal
    // (non-throwing) Response — ofetch only throws for 400-599 — so redirect
    // handling now happens on the success path rather than in the catch block.
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const redirectLocation = response.headers.get('location');
      if (!redirectLocation) {
        throw new Error('Redirect missing Location header');
      }

      // Resolve relative URLs against the original URL
      const redirectUrl = new URL(redirectLocation, url).toString();

      if (redirectChecker(url, redirectUrl)) {
        // Recursively follow the permitted redirect
        return getWithPermittedRedirects(redirectUrl, signal, redirectChecker, depth + 1);
      } else {
        // Return redirect information to the caller
        return {
          type: 'redirect',
          originalUrl: url,
          redirectUrl,
          statusCode: response.status,
        };
      }
    }

    return response;
  } catch (error) {
    // Detect egress proxy blocks: the proxy returns 403 with
    // X-Proxy-Error: blocked-by-allowlist when egress is restricted
    if (
      isFetchError(error) &&
      error.response?.status === 403 &&
      error.response.headers['x-proxy-error'] === 'blocked-by-allowlist'
    ) {
      const hostname = new URL(url).hostname;
      throw new EgressBlockedError(hostname);
    }

    throw error;
  }
}

function isRedirectInfo(response: Response | RedirectInfo): response is RedirectInfo {
  return 'type' in response && response.type === 'redirect';
}

export type FetchedContent = {
  content: string;
  bytes: number;
  code: number;
  codeText: string;
  contentType: string;
  persistedPath?: string;
  persistedSize?: number;
};

export async function getURLMarkdownContent(
  url: string,
  abortController: AbortController,
): Promise<FetchedContent | RedirectInfo> {
  if (!validateURL(url)) {
    throw new Error('Invalid URL');
  }

  // Check cache (LRUCache handles TTL automatically)
  const cachedEntry = URL_CACHE.get(url);
  if (cachedEntry) {
    return {
      bytes: cachedEntry.bytes,
      code: cachedEntry.code,
      codeText: cachedEntry.codeText,
      content: cachedEntry.content,
      contentType: cachedEntry.contentType,
      persistedPath: cachedEntry.persistedPath,
      persistedSize: cachedEntry.persistedSize,
    };
  }

  let parsedUrl: URL;
  let upgradedUrl = url;

  try {
    parsedUrl = new URL(url);

    // Upgrade http to https if needed
    if (parsedUrl.protocol === 'http:') {
      parsedUrl.protocol = 'https:';
      upgradedUrl = parsedUrl.toString();
    }

    const hostname = parsedUrl.hostname;

    // Check if the user has opted to skip the blocklist check
    // This is for enterprise customers with restrictive security policies
    // that prevent outbound connections to claude.ai
    const settings = getSettings_DEPRECATED();
    if (!settings.skipWebFetchPreflight) {
      const checkResult = await checkDomainBlocklist(hostname);
      switch (checkResult.status) {
        case 'allowed':
          // Continue with the fetch
          break;
        case 'blocked':
          throw new DomainBlockedError(hostname);
        case 'check_failed':
          throw new DomainCheckFailedError(hostname);
      }
    }

    if (process.env.USER_TYPE === 'ant') {
      logEvent('tengu_web_fetch_host', {
        hostname: hostname as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      });
    }
  } catch (e) {
    if (e instanceof DomainBlockedError || e instanceof DomainCheckFailedError) {
      // Expected user-facing failures - re-throw without logging as internal error
      throw e;
    }
    // BUG (fail-open security boundary): any *other* exception here (e.g.
    // getSettings_DEPRECATED() or logEvent() throwing) previously fell
    // through silently and let the fetch below proceed as if the domain
    // safety check had passed. This block is the primary SSRF/blocklist
    // gate, so an unexpected error must fail closed, not open.
    logError(e);
    const failedHostname = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    })();
    throw new DomainCheckFailedError(failedHostname);
  }

  let response;
  try {
    response = await getWithPermittedRedirects(upgradedUrl, abortController.signal, isPermittedRedirect);
  } catch (err) {
    // BUG (exfiltration): falling back to a third-party proxy (r.jina.ai) on
    // *any* primary-fetch failure sends the full URL — including any
    // query-string tokens/secrets in signed URLs — to an uncontrolled third
    // party, with no logging and no opt-out. Don't do this when the primary
    // fetch was deliberately blocked by network policy (egress proxy) or by
    // our own domain safety check — those are decisions the fallback would
    // silently defeat.
    if (
      err instanceof EgressBlockedError ||
      err instanceof DomainBlockedError ||
      err instanceof DomainCheckFailedError
    ) {
      throw err;
    }
    logForDiagnosticsNoPII('warn', 'web_fetch_jina_fallback_used', {
      errorType: err instanceof Error ? err.constructor.name : typeof err,
    });
    try {
      const jinaUrl = `https://r.jina.ai/${upgradedUrl}`;
      response = await getWithPermittedRedirects(jinaUrl, abortController.signal, isPermittedRedirect);
    } catch (_) {
      throw err;
    }
  }

  // Check if we got a redirect response
  if (isRedirectInfo(response)) {
    return response;
  }

  const body = response._data ?? (response as any).data;
  const rawBuffer = Buffer.from(body);
  // Release the axios-held ArrayBuffer copy; rawBuffer owns the bytes now.
  // This lets GC reclaim up to MAX_HTTP_CONTENT_LENGTH (10MB) before Turndown
  // builds its DOM tree (which can be 3-5x the HTML size).
  (response as any)._data = null;
  (response as any).data = null;
  const contentType =
    (typeof response.headers?.get === 'function'
      ? response.headers.get('content-type')
      : (response.headers as any)?.['content-type']) ?? '';

  // Binary content: save raw bytes to disk with a proper extension so Claude
  // can inspect the file later. We still fall through to the utf-8 decode +
  // Haiku path below — for PDFs in particular the decoded string has enough
  // ASCII structure (/Title, text streams) that Haiku can summarize it, and
  // the saved file is a supplement rather than a replacement.
  let persistedPath: string | undefined;
  let persistedSize: number | undefined;
  if (isBinaryContentType(contentType)) {
    const persistId = `webfetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const result = await persistBinaryContent(rawBuffer, contentType, persistId);
    if (!('error' in result)) {
      persistedPath = result.filepath;
      persistedSize = result.size;
    }
  }

  const bytes = rawBuffer.length;
  const htmlContent = rawBuffer.toString('utf-8');

  let markdownContent: string;
  let contentBytes: number;
  if (contentType.includes('text/html')) {
    // Strip style and script tags before conversion to prevent
    // CSS-heavy pages from exhausting the content budget
    const strippedHtml = stripStyleScriptTags(htmlContent);
    markdownContent = (await getTurndownService()).turndown(strippedHtml);
    contentBytes = Buffer.byteLength(markdownContent);
  } else {
    // It's not HTML - just use it raw. The decoded string's UTF-8 byte
    // length equals rawBuffer.length (modulo U+FFFD replacement on invalid
    // bytes — negligible for cache eviction accounting), so skip the O(n)
    // Buffer.byteLength scan.
    markdownContent = htmlContent;
    contentBytes = bytes;
  }

  // Store the fetched content in cache. Note that it's stored under
  // the original URL, not the upgraded or redirected URL.
  const entry: CacheEntry = {
    bytes,
    code: response.status,
    codeText: response.statusText,
    content: markdownContent,
    contentType,
    persistedPath,
    persistedSize,
  };
  // lru-cache requires positive integers; clamp to 1 for empty responses.
  URL_CACHE.set(url, entry, { size: Math.max(1, contentBytes) });
  return entry;
}

export async function applyPromptToMarkdown(
  prompt: string,
  markdownContent: string,
  signal: AbortSignal,
  isNonInteractiveSession: boolean,
  isPreapprovedDomain: boolean,
): Promise<string> {
  // Truncate content to avoid "Prompt is too long" errors from the secondary model
  const truncatedContent =
    markdownContent.length > MAX_MARKDOWN_LENGTH
      ? `${markdownContent.slice(0, MAX_MARKDOWN_LENGTH)}\n\n[Content truncated due to length...]`
      : markdownContent;

  const modelPrompt = makeSecondaryModelPrompt(truncatedContent, prompt, isPreapprovedDomain);
  const assistantMessage = await queryHaiku({
    systemPrompt: asSystemPrompt([]),
    userPrompt: modelPrompt,
    signal,
    options: {
      querySource: 'web_fetch_apply',
      agents: [],
      isNonInteractiveSession,
      hasAppendSystemPrompt: false,
      mcpTools: [],
    },
  });

  // We need to bubble this up, so that the tool call throws, causing us to return
  // an is_error tool_use block to the server, and render a red dot in the UI.
  if (signal.aborted) {
    throw new AbortError();
  }

  const { content } = assistantMessage.message;
  if (content.length > 0) {
    const contentBlock = content[0];
    if ('text' in contentBlock!) {
      return contentBlock.text;
    }
  }
  return 'No response from model';
}
