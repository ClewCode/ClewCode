import { afterEach, describe, expect, test } from 'vitest';
import { AuthCodeListener } from './auth-code-listener.js';

describe('AuthCodeListener', () => {
  let listener: AuthCodeListener | undefined;

  afterEach(() => {
    listener?.close();
  });

  test('accepts the /callback path used in the OAuth redirect URI', async () => {
    listener = new AuthCodeListener();
    const port = await listener.start();
    let callbackResponse: Promise<Response> | undefined;

    const authorization = listener.waitForAuthorization('expected-state', async () => {
      callbackResponse = fetch(`http://localhost:${port}/callback?code=authorization-code&state=expected-state`);
    });

    await expect(authorization).resolves.toBe('authorization-code');
    listener.handleSuccessRedirect([], res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Authentication complete');
    });

    const response = await callbackResponse;
    expect(response?.status).toBe(200);
    await expect(response?.text()).resolves.toBe('Authentication complete');
  });

  test('starts on OS-assigned port when no port is specified', async () => {
    listener = new AuthCodeListener();
    const port = await listener.start(0);
    expect(port).toBeGreaterThan(0);

    // Verify the listener works on the assigned port
    let callbackResponse: Promise<Response> | undefined;
    const authorization = listener.waitForAuthorization('os-port-state', async () => {
      callbackResponse = fetch(`http://localhost:${port}/callback?code=os-port-code&state=os-port-state`);
    });
    await expect(authorization).resolves.toBe('os-port-code');
    listener.handleSuccessRedirect([], res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    const response = await callbackResponse;
    expect(response?.status).toBe(200);
  });

  test('/auth/callback path is accepted', async () => {
    listener = new AuthCodeListener('/auth/callback');
    const port = await listener.start();
    let callbackResponse: Promise<Response> | undefined;

    const authorization = listener.waitForAuthorization('state1', async () => {
      callbackResponse = fetch(`http://localhost:${port}/auth/callback?code=auth-code&state=state1`);
    });

    await expect(authorization).resolves.toBe('auth-code');
    listener.handleSuccessRedirect([], res => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });

    const response = await callbackResponse;
    expect(response?.status).toBe(200);
  });

  test('rejects when state parameter mismatches', async () => {
    listener = new AuthCodeListener();
    const port = await listener.start();
    let callbackResponse: Promise<Response> | undefined;

    const authorization = listener.waitForAuthorization('expected-state', async () => {
      callbackResponse = fetch(`http://localhost:${port}/callback?code=auth-code&state=wrong-state`);
    });

    await expect(authorization).rejects.toThrow('Invalid state');
    const response = await callbackResponse;
    expect(response?.status).toBe(400);
  });
});
