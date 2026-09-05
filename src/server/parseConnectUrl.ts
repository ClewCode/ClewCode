/**
 * parseConnectUrl — parses `cc://` deep links into direct-connect params.
 *
 * Format:
 *   cc://host[:port][/basepath]?token=<authToken>[&tls=1]
 *
 * Examples:
 *   cc://192.168.1.10:8080?token=abc
 *     → { serverUrl: 'http://192.168.1.10:8080', authToken: 'abc' }
 *   cc://example.com/clew?token=abc&tls=1
 *     → { serverUrl: 'https://example.com/clew', authToken: 'abc' }
 *
 * `cc+unix://` links are rejected with a clear error: the current
 * direct-connect client (`createDirectConnectSession`) only speaks TCP
 * HTTP, so a unix-socket URL has nowhere to go. If unix transport is added,
 * extend the return type with `socketPath` and update both call sites.
 */

export type ParsedConnectUrl = {
  /** Base HTTP URL of the Clew Code server (no trailing slash). */
  serverUrl: string;
  /** Bearer token for the server, when the link carries one. */
  authToken?: string;
};

export function parseConnectUrl(ccUrl: string): ParsedConnectUrl {
  if (ccUrl.startsWith('cc+unix://')) {
    throw new Error(
      'Unix-socket connect URLs (cc+unix://) are not supported by this client yet — ' +
        'connect over TCP (cc://host:port) or use `clew ssh` instead.',
    );
  }
  let url: URL;
  try {
    // URL requires a known scheme — rewrite cc:// to http:// for parsing,
    // then re-derive the real scheme from the tls param.
    url = new URL(ccUrl.replace(/^cc:\/\//, 'http://'));
  } catch {
    throw new Error(`Invalid connect URL: ${ccUrl}`);
  }

  const host = url.hostname;
  if (!host) {
    throw new Error(`Invalid connect URL (missing host): ${ccUrl}`);
  }

  const tls = url.searchParams.get('tls') === '1' || url.searchParams.get('tls') === 'true';
  const scheme = tls ? 'https' : 'http';
  const port = url.port ? `:${url.port}` : '';
  const basepath = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
  const serverUrl = `${scheme}://${host}${port}${basepath}`;

  const token = url.searchParams.get('token') ?? undefined;
  return token ? { serverUrl, authToken: token } : { serverUrl };
}
