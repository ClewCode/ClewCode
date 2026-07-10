import { beforeEach, describe, expect, mock, test } from 'bun:test';

const raw = mock(async () => ({
  status: 200,
  statusText: 'OK',
  _data: {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    scope: 'user:inference',
  },
}));

mock.module('ofetch', () => ({
  ofetch: Object.assign(mock(), { raw }),
}));

describe('Anthropic OAuth client', () => {
  beforeEach(() => {
    raw.mockClear();
  });

  test('exchanges an authorization code with POST', async () => {
    const { exchangeCodeForTokens } = await import('./client.js');

    const tokens = await exchangeCodeForTokens('authorization-code', 'state', 'verifier', 54321, false);

    expect(tokens.access_token).toBe('access-token');
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code: 'authorization-code',
        redirect_uri: 'http://localhost:54321/callback',
        client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
        code_verifier: 'verifier',
        state: 'state',
      },
    });
  });
});
