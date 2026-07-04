// @aws-sdk/credential-provider-node and @smithy/node-http-handler are imported
// dynamically in getAWSClientProxyConfig() to defer ~929KB of AWS SDK.
// undici is lazy-required inside getProxyAgent/configureGlobalAgents to defer
// ~1.5MB when no HTTPS_PROXY/mTLS env vars are set (the common case).

import { HttpsProxyAgent } from 'https-proxy-agent';
import memoize from 'lodash-es/memoize.js';
import { ofetch } from 'ofetch';
import { getCACertificates } from './caCerts.js';
import { logForDebugging } from './debug.js';
import { isEnvTruthy } from './envUtils.js';
import { getMTLSAgent, getMTLSConfig, getTLSFetchOptions } from './mtls.js';

// Disable fetch keep-alive after a stale-pool ECONNRESET so retries open a
// fresh TCP connection instead of reusing the dead pooled socket. Sticky for
// the process lifetime — once the pool is known-bad, don't trust it again.
// Works under Bun (native fetch respects keepalive:false for pooling).
// Under Node/undici, keepalive is a no-op for pooling, but undici
// naturally evicts dead sockets from the pool on ECONNRESET.
let keepAliveDisabled = false;
export function disableKeepAlive() {
  keepAliveDisabled = true;
}
export function _resetKeepAliveForTesting() {
  keepAliveDisabled = false;
}
/**
 * Convert dns.LookupOptions.family to a numeric address family value
 * Handles: 0 | 4 | 6 | 'IPv4' | 'IPv6' | undefined
 */
export function getAddressFamily(options) {
  switch (options.family) {
    case 0:
    case 4:
    case 6:
      return options.family;
    case 'IPv6':
      return 6;
    case 'IPv4':
    case undefined:
      return 4;
    default:
      throw new Error(`Unsupported address family: ${options.family}`);
  }
}
/**
 * Get the active proxy URL if one is configured
 * Prefers lowercase variants over uppercase (https_proxy > HTTPS_PROXY > http_proxy > HTTP_PROXY)
 * @param env Environment variables to check (defaults to process.env for production use)
 */
export function getProxyUrl(env = process.env) {
  return env.https_proxy || env.HTTPS_PROXY || env.http_proxy || env.HTTP_PROXY;
}
/**
 * Get the NO_PROXY environment variable value
 * Prefers lowercase over uppercase (no_proxy > NO_PROXY)
 * @param env Environment variables to check (defaults to process.env for production use)
 */
export function getNoProxy(env = process.env) {
  return env.no_proxy || env.NO_PROXY;
}
/**
 * Check if a URL should bypass the proxy based on NO_PROXY environment variable
 * Supports:
 * - Exact hostname matches (e.g., "localhost")
 * - Domain suffix matches with leading dot (e.g., ".example.com")
 * - Wildcard "*" to bypass all
 * - Port-specific matches (e.g., "example.com:8080")
 * - IP addresses (e.g., "127.0.0.1")
 * @param urlString URL to check
 * @param noProxy NO_PROXY value (defaults to getNoProxy() for production use)
 */
export function shouldBypassProxy(urlString, noProxy = getNoProxy()) {
  if (!noProxy) return false;
  // Handle wildcard
  if (noProxy === '*') return true;
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    const hostWithPort = `${hostname}:${port}`;
    // Split by comma or space and trim each entry
    const noProxyList = noProxy.split(/[,\s]+/).filter(Boolean);
    return noProxyList.some(pattern => {
      pattern = pattern.toLowerCase().trim();
      // Check for port-specific match
      if (pattern.includes(':')) {
        return hostWithPort === pattern;
      }
      // Check for domain suffix match (with or without leading dot)
      if (pattern.startsWith('.')) {
        // Pattern ".example.com" should match "sub.example.com" and "example.com"
        // but NOT "notexample.com"
        const suffix = pattern;
        return hostname === pattern.substring(1) || hostname.endsWith(suffix);
      }
      // Check for exact hostname match or IP address
      return hostname === pattern;
    });
  } catch {
    // If URL parsing fails, don't bypass proxy
    return false;
  }
}
/**
 * Create an HttpsProxyAgent with optional mTLS configuration
 * Skips local DNS resolution to let the proxy handle it
 */
function createHttpsProxyAgent(proxyUrl, extra = {}) {
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  const agentOptions = {
    ...(mtlsConfig && {
      cert: mtlsConfig.cert,
      key: mtlsConfig.key,
      passphrase: mtlsConfig.passphrase,
    }),
    ...(caCerts && { ca: caCerts }),
  };
  if (isEnvTruthy(process.env.CLEW_CODE_PROXY_RESOLVES_HOSTS)) {
    // Skip local DNS resolution - let the proxy resolve hostnames
    // This is needed for environments where DNS is not configured locally
    // and instead handled by the proxy (as in sandboxes)
    agentOptions.lookup = (hostname, options, callback) => {
      callback(null, hostname, getAddressFamily(options));
    };
  }
  return new HttpsProxyAgent(proxyUrl, { ...agentOptions, ...extra });
}
/**
 * ofetch instance with its own proxy agent. Same NO_PROXY/mTLS/CA
 * resolution as getProxyFetchOptions, but agent options stay
 * scoped to this instance.
 *
 * ofetch v1.x doesn't expose .defaults or .interceptors like axios,
 * so proxy is configured via undici's setGlobalDispatcher or Bun's native
 * proxy option rather than per-request interceptors.
 */
export function createFetchInstance() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return ofetch.create({});
  }
  // Proxy: Bun's native fetch accepts a `proxy` string option;
  // Node.js uses undici's EnvHttpProxyAgent as the dispatcher.
  if (typeof Bun !== 'undefined') {
    return ofetch.create({ proxy: proxyUrl });
  }
  return ofetch.create({ dispatcher: getProxyAgent(proxyUrl) });
}
/**
 * Get or create a memoized proxy agent for the given URI
 * Now respects NO_PROXY environment variable
 */
export const getProxyAgent = memoize(uri => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const undiciMod = require('undici');
  const mtlsConfig = getMTLSConfig();
  const caCerts = getCACertificates();
  // Use EnvHttpProxyAgent to respect NO_PROXY
  // This agent automatically checks NO_PROXY for each request
  const proxyOptions = {
    // Override both HTTP and HTTPS proxy with the provided URI
    httpProxy: uri,
    httpsProxy: uri,
    noProxy: process.env.NO_PROXY || process.env.no_proxy,
  };
  // Set both connect and requestTls so TLS options apply to both paths:
  // - requestTls: used by ProxyAgent for the TLS connection through CONNECT tunnels
  // - connect: used by Agent for direct (no-proxy) connections
  if (mtlsConfig || caCerts) {
    const tlsOpts = {
      ...(mtlsConfig && {
        cert: mtlsConfig.cert,
        key: mtlsConfig.key,
        passphrase: mtlsConfig.passphrase,
      }),
      ...(caCerts && { ca: caCerts }),
    };
    proxyOptions.connect = tlsOpts;
    proxyOptions.requestTls = tlsOpts;
  }
  return new undiciMod.EnvHttpProxyAgent(proxyOptions);
});
/**
 * Get an HTTP agent configured for WebSocket proxy support
 * Returns undefined if no proxy is configured or URL should bypass proxy
 */
export function getWebSocketProxyAgent(url) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return undefined;
  }
  // Check if URL should bypass proxy
  if (shouldBypassProxy(url)) {
    return undefined;
  }
  return createHttpsProxyAgent(proxyUrl);
}
/**
 * Get the proxy URL for WebSocket connections under Bun.
 * Bun's native WebSocket supports a `proxy` string option instead of Node's `agent`.
 * Returns undefined if no proxy is configured or URL should bypass proxy.
 */
export function getWebSocketProxyUrl(url) {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return undefined;
  }
  if (shouldBypassProxy(url)) {
    return undefined;
  }
  return proxyUrl;
}
/**
 * Get fetch options for the Anthropic SDK with proxy and mTLS configuration
 * Returns fetch options with appropriate dispatcher for proxy and/or mTLS
 *
 * @param opts.forAnthropicAPI - Enables ANTHROPIC_UNIX_SOCKET tunneling. This
 *   env var is set by `claude ssh` on the remote CLI to route API calls through
 *   an ssh -R forwarded unix socket to a local auth proxy. It MUST NOT leak
 *   into non-Anthropic-API fetch paths (MCP HTTP/SSE transports, etc.) or those
 *   requests get misrouted to api.anthropic.com. Only the Anthropic SDK client
 *   should pass `true` here.
 */
export function getProxyFetchOptions(opts) {
  const base = keepAliveDisabled ? { keepalive: false } : {};
  // ANTHROPIC_UNIX_SOCKET tunnels through the `claude ssh` auth proxy, which
  // hardcodes the upstream to the Anthropic API. Scope to the Anthropic API
  // client so MCP/SSE/other callers don't get their requests misrouted.
  if (opts?.forAnthropicAPI) {
    const unixSocket = process.env.ANTHROPIC_UNIX_SOCKET;
    if (unixSocket && typeof Bun !== 'undefined') {
      return { ...base, unix: unixSocket };
    }
  }
  const proxyUrl = getProxyUrl();
  // If we have a proxy, use the proxy agent (which includes mTLS config)
  if (proxyUrl) {
    if (typeof Bun !== 'undefined') {
      return { ...base, proxy: proxyUrl, ...getTLSFetchOptions() };
    }
    return { ...base, dispatcher: getProxyAgent(proxyUrl) };
  }
  // Otherwise, use TLS options directly if available
  return { ...base, ...getTLSFetchOptions() };
}
/**
 * Configure global HTTP agents.
 * ofetch v1.x doesn't expose .defaults or .interceptors like axios,
 * so proxy handling is done via undici's global dispatcher (Node.js)
 * or Bun's native proxy support.
 */
export function configureGlobalAgents() {
  const proxyUrl = getProxyUrl();
  const mtlsAgent = getMTLSAgent();
  if (proxyUrl) {
    // EnvHttpProxyAgent respects NO_PROXY natively
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('undici').setGlobalDispatcher(getProxyAgent(proxyUrl));
  } else if (mtlsAgent) {
    // No proxy but mTLS is configured
    const mtlsOptions = getTLSFetchOptions();
    if (mtlsOptions.dispatcher) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('undici').setGlobalDispatcher(mtlsOptions.dispatcher);
    }
  }
}
/**
 * Get AWS SDK client configuration with proxy support
 * Returns configuration object that can be spread into AWS service client constructors
 */
export async function getAWSClientProxyConfig() {
  const proxyUrl = getProxyUrl();
  if (!proxyUrl) {
    return {};
  }
  const [{ NodeHttpHandler }, { defaultProvider }] = await Promise.all([
    import('@smithy/node-http-handler'),
    import('@aws-sdk/credential-provider-node'),
  ]);
  const agent = createHttpsProxyAgent(proxyUrl);
  const requestHandler = new NodeHttpHandler({
    httpAgent: agent,
    httpsAgent: agent,
  });
  return {
    requestHandler,
    credentials: defaultProvider({
      clientConfig: { requestHandler },
    }),
  };
}
/**
 * Clear proxy agent cache.
 */
export function clearProxyCache() {
  getProxyAgent.cache.clear?.();
  logForDebugging('Cleared proxy agent cache');
}
