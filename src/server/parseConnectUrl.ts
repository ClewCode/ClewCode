export type ParsedConnectUrl = {
  serverUrl: string;
  authToken?: string;
};

/**
 * Parse a `cc://` or `cc+unix://` connect URL.
 *
 * Formats:
 *   cc://host:port?token=xxx
 *   cc+unix:///path/to/socket?token=xxx
 */
export function parseConnectUrl(ccUrl: string): ParsedConnectUrl {
  if (ccUrl.startsWith('cc+unix://')) {
    const rest = ccUrl.slice('cc+unix://'.length);
    const [pathPart, queryPart] = rest.split('?');
    const socketPath = pathPart ?? '';
    const token = queryPart ? (new URLSearchParams(queryPart).get('token') ?? undefined) : undefined;
    return { serverUrl: `unix:${socketPath}`, authToken: token };
  }

  const url = new URL(ccUrl.replace(/^cc:\/\//, 'http://'));
  return {
    serverUrl: url.href,
    authToken: url.searchParams.get('token') ?? undefined,
  };
}
