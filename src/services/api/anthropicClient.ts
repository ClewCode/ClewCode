import Anthropic, { type ClientOptions } from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import type { GoogleAuth } from 'google-auth-library';
import {
  checkAndRefreshOAuthTokenIfNeeded,
  getAnthropicApiKey,
  getApiKeyFromApiKeyHelper,
  getClaudeAIOAuthTokens,
  isClaudeAISubscriber,
  refreshAndGetAwsCredentials,
  refreshGcpCredentialsIfNeeded,
} from 'src/utils/auth.js';
import { getUserAgent } from 'src/utils/http.js';
import { getSmallFastModel } from 'src/utils/model/model.js';
import { getAPIProvider, isFirstPartyAnthropicBaseUrl } from 'src/utils/model/providers.js';
import { getProxyFetchOptions } from 'src/utils/proxy.js';
import { getIsNonInteractiveSession, getSessionId } from '../../bootstrap/state.js';
import { getOauthConfig } from '../../constants/oauth.js';
import { isDebugToStdErr, logForDebugging } from '../../utils/debug.js';
import { getAWSRegion, getVertexRegionForModel, isEnvTruthy } from '../../utils/envUtils.js';

export async function createAnthropicClient({
  apiKey,
  maxRetries,
  model,
  fetchOverride,
  source,
}: {
  apiKey?: string;
  maxRetries: number;
  model?: string;
  fetchOverride?: ClientOptions['fetch'];
  source?: string;
}): Promise<Anthropic> {
  const containerId = process.env.CLAUDE_CODE_CONTAINER_ID;
  const remoteSessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID;
  const _clientApp = process.env.CLAUDE_AGENT_SDK_CLIENT_APP;
  const customHeaders = getCustomHeaders();
  const defaultHeaders: { [key: string]: string } = {
    'x-app': 'cli',
    'User-Agent': getUserAgent(),
    'X-Claude-Code-Session-Id': getSessionId(),
    ...customHeaders,
    ...(containerId ? { 'x-claude-remote-container-id': containerId } : {}),
    ...(remoteSessionId ? { 'x-claude-remote-session-id': remoteSessionId } : {}),
  };

  logForDebugging(
    `[API:request] Creating client, ANTHROPIC_CUSTOM_HEADERS present: ${!!process.env.ANTHROPIC_CUSTOM_HEADERS}, has Authorization header: ${!!customHeaders['Authorization']}`,
  );

  const additionalProtectionEnabled = isEnvTruthy(process.env.CLAUDE_CODE_ADDITIONAL_PROTECTION);
  if (additionalProtectionEnabled) {
    defaultHeaders['x-anthropic-additional-protection'] = 'true';
  }

  logForDebugging('[API:auth] OAuth token check starting');
  await checkAndRefreshOAuthTokenIfNeeded();
  logForDebugging('[API:auth] OAuth token check complete');

  if (!isClaudeAISubscriber()) {
    await configureApiKeyHeaders(defaultHeaders, getIsNonInteractiveSession());
  }

  const resolvedFetch = buildFetch(fetchOverride, source);

  const ARGS: Record<string, unknown> = {
    defaultHeaders,
    maxRetries,
    timeout: parseInt(process.env.API_TIMEOUT_MS || String(600 * 1000), 10),
    dangerouslyAllowBrowser: true,
    fetchOptions: getProxyFetchOptions({
      forAnthropicAPI: true,
    }) as any,
    ...(resolvedFetch && {
      fetch: resolvedFetch,
    }),
  };
  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) || isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE)) {
    const { AnthropicBedrock } = await import('@anthropic-ai/bedrock-sdk');
    const awsRegion =
      model === getSmallFastModel() && process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        ? process.env.ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION
        : getAWSRegion();

    const bedrockArgs: any = {
      ...ARGS,
      awsRegion,
      ...(isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH) && {
        skipAuth: true,
      }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };

    const skipBedrockAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH);
    const bedrockAuthorizationHeader = process.env.AWS_BEARER_TOKEN_BEDROCK
      ? `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`
      : defaultHeaders['Authorization'];

    // Mantle endpoint authentication: uses x-api-key header instead of
    // AWS Signature V4 or Bearer token. When ANTHROPIC_MANTLE_API_KEY is set,
    // skip AWS credential resolution and inject the key in API requests.
    const mantleApiKey = process.env.ANTHROPIC_MANTLE_API_KEY;
    const isMantle = isEnvTruthy(process.env.CLAUDE_CODE_USE_MANTLE);

    if (isMantle && mantleApiKey) {
      bedrockArgs.skipAuth = true;
      bedrockArgs.defaultHeaders = {
        ...bedrockArgs.defaultHeaders,
        'x-api-key': mantleApiKey,
      };
    }

    // Bedrock service tier: when ANTHROPIC_BEDROCK_SERVICE_TIER is set,
    // inject it as the X-Amzn-Bedrock-Service-Tier header on every request.
    // This lets Bedrock users opt into cross-region inference profiles
    // without modifying their AWS infrastructure.
    const bedrockServiceTier = process.env.ANTHROPIC_BEDROCK_SERVICE_TIER;
    if (bedrockServiceTier && !isMantle) {
      const innerFetch = resolvedFetch ?? globalThis.fetch;
      const existingFetch = bedrockArgs.fetch;
      bedrockArgs.fetch = existingFetch
        ? (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            if (!headers.has('X-Amzn-Bedrock-Service-Tier')) {
              headers.set('X-Amzn-Bedrock-Service-Tier', bedrockServiceTier);
            }
            return existingFetch(input, { ...init, headers });
          }
        : (input: RequestInfo | URL, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            if (!headers.has('X-Amzn-Bedrock-Service-Tier')) {
              headers.set('X-Amzn-Bedrock-Service-Tier', bedrockServiceTier);
            }
            return innerFetch(input as any, { ...init, headers });
          };
    }

    if ((skipBedrockAuth || process.env.AWS_BEARER_TOKEN_BEDROCK) && bedrockAuthorizationHeader) {
      const innerFetch = resolvedFetch ?? globalThis.fetch;
      bedrockArgs.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        if (!headers.has('Authorization')) {
          headers.set('Authorization', bedrockAuthorizationHeader);
        }
        return innerFetch(input as any, { ...init, headers });
      };
    }

    if (process.env.AWS_BEARER_TOKEN_BEDROCK) {
      bedrockArgs.skipAuth = true;
      bedrockArgs.defaultHeaders = {
        ...bedrockArgs.defaultHeaders,
        Authorization: `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
      };
    } else if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_BEDROCK_AUTH)) {
      const cachedCredentials = await refreshAndGetAwsCredentials();
      if (cachedCredentials) {
        bedrockArgs.awsAccessKey = cachedCredentials.accessKeyId;
        bedrockArgs.awsSecretKey = cachedCredentials.secretAccessKey;
        bedrockArgs.awsSessionToken = cachedCredentials.sessionToken;
      }
    }
    return new AnthropicBedrock(bedrockArgs) as unknown as Anthropic;
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY)) {
    const { AnthropicFoundry } = await import('@anthropic-ai/foundry-sdk');
    let azureADTokenProvider: (() => Promise<string>) | undefined;
    if (!process.env.ANTHROPIC_FOUNDRY_API_KEY) {
      if (isEnvTruthy(process.env.CLAUDE_CODE_SKIP_FOUNDRY_AUTH)) {
        azureADTokenProvider = () => Promise.resolve('');
      } else {
        const { DefaultAzureCredential: AzureCredential, getBearerTokenProvider } = await import('@azure/identity');
        azureADTokenProvider = getBearerTokenProvider(
          new AzureCredential(),
          'https://cognitiveservices.azure.com/.default',
        );
      }
    }

    const foundryArgs: any = {
      ...ARGS,
      ...(azureADTokenProvider && { azureADTokenProvider }),
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };
    return new AnthropicFoundry(foundryArgs) as unknown as Anthropic;
  }

  if (isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX)) {
    if (!isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)) {
      await refreshGcpCredentialsIfNeeded();
    }

    const [{ AnthropicVertex }, { GoogleAuth }] = await Promise.all([
      import('@anthropic-ai/vertex-sdk'),
      import('google-auth-library'),
    ]);

    const hasProjectEnvVar =
      process.env['GCLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['gcloud_project'] ||
      process.env['google_cloud_project'];

    const hasKeyFile = process.env['GOOGLE_APPLICATION_CREDENTIALS'] || process.env['google_application_credentials'];

    const googleAuth = isEnvTruthy(process.env.CLAUDE_CODE_SKIP_VERTEX_AUTH)
      ? ({
          getClient: () => ({
            getRequestHeaders: () => ({}),
          }),
        } as unknown as GoogleAuth)
      : new GoogleAuth({
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
          ...(hasProjectEnvVar || hasKeyFile
            ? {}
            : {
                projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID,
              }),
        });

    const vertexArgs: any = {
      ...ARGS,
      region: getVertexRegionForModel(model),
      googleAuth,
      ...(isDebugToStdErr() && { logger: createStderrLogger() }),
    };
    return new AnthropicVertex(vertexArgs) as unknown as Anthropic;
  }

  const clientConfig: ConstructorParameters<typeof Anthropic>[0] = {
    apiKey: isClaudeAISubscriber() ? null : apiKey || getAnthropicApiKey(),
    authToken: isClaudeAISubscriber() ? getClaudeAIOAuthTokens()?.accessToken : undefined,
    ...(process.env.USER_TYPE === 'ant' && isEnvTruthy(process.env.USE_STAGING_OAUTH)
      ? { baseURL: getOauthConfig().BASE_API_URL }
      : {}),
    ...ARGS,
    ...(isDebugToStdErr() && { logger: createStderrLogger() }),
  };

  const client = new Anthropic(clientConfig);
  logForDebugging(
    `[createAnthropicClient] Created Anthropic client, has beta: ${'beta' in client}, beta type: ${typeof client.beta}, has messages: ${client.beta ? 'messages' in client.beta : false}`,
  );
  return client;
}

function createStderrLogger(): any {
  return {
    error: (msg, ...args) => console.error('[Anthropic SDK ERROR]', msg, ...args),
    warn: (msg, ...args) => console.error('[Anthropic SDK WARN]', msg, ...args),
    info: (msg, ...args) => console.error('[Anthropic SDK INFO]', msg, ...args),
    debug: (msg, ...args) => console.error('[Anthropic SDK DEBUG]', msg, ...args),
  };
}

async function configureApiKeyHeaders(
  headers: Record<string, string>,
  isNonInteractiveSession: boolean,
): Promise<void> {
  const token = process.env.ANTHROPIC_AUTH_TOKEN || (await getApiKeyFromApiKeyHelper(isNonInteractiveSession));
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // ANTHROPIC_WORKSPACE_ID scopes the minted token to a specific workspace
  // when the workload identity federation rule covers more than one workspace.
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
  if (workspaceId) {
    headers['anthropic-workspace-id'] = workspaceId;
  }
}

function getCustomHeaders(): Record<string, string> {
  const customHeaders: Record<string, string> = {};
  const customHeadersEnv = process.env.ANTHROPIC_CUSTOM_HEADERS;

  if (!customHeadersEnv) return customHeaders;

  const headerStrings = customHeadersEnv.split(/\n|\r\n/);

  for (const headerString of headerStrings) {
    if (!headerString.trim()) continue;

    const colonIdx = headerString.indexOf(':');
    if (colonIdx === -1) continue;
    const name = headerString.slice(0, colonIdx).trim();
    const value = headerString.slice(colonIdx + 1).trim();
    if (name) {
      customHeaders[name] = value;
    }
  }

  return customHeaders;
}

export const CLIENT_REQUEST_ID_HEADER = 'x-client-request-id';

function buildFetch(fetchOverride: any, source: string | undefined): any {
  const inner: any = fetchOverride ?? globalThis.fetch;
  const injectClientRequestId = getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl();
  return (input: any, init: any) => {
    const headers = new Headers(init?.headers);
    if (injectClientRequestId && !headers.has(CLIENT_REQUEST_ID_HEADER)) {
      headers.set(CLIENT_REQUEST_ID_HEADER, randomUUID());
    }
    try {
      const url = input instanceof Request ? input.url : String(input);
      const id = headers.get(CLIENT_REQUEST_ID_HEADER);
      logForDebugging(
        `[API REQUEST] ${new URL(url).pathname}${id ? ` ${CLIENT_REQUEST_ID_HEADER}=${id}` : ''} source=${source ?? 'unknown'}`,
      );
    } catch {
      // never let logging crash the fetch
    }
    return inner(input, { ...init, headers });
  };
}
