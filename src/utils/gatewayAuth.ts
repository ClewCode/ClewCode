/**
 * Gateway Auth — login/logout for api.clew-code.org
 *
 * When CLEW_GATEWAY_URL is set, 'clew auth login' uses the gateway
 * instead of Anthropic's OAuth flow.
 */

import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const GATEWAY_URL = process.env.CLEW_GATEWAY_URL || 'https://api.clew-code.org/v1';

export type GatewayAuthResult = {
	token: string;
	user: { id: string; email: string; tier: string };
};

/**
 * Login to the gateway with email + password.
 */
export async function login(email: string, password: string): Promise<GatewayAuthResult> {
	const res = await fetch(`${GATEWAY_URL}/v1/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Gateway login failed');
	return data;
}

/**
 * Signup to the gateway.
 */
export async function signup(email: string, password: string): Promise<GatewayAuthResult> {
	const res = await fetch(`${GATEWAY_URL}/v1/auth/signup`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email, password }),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Gateway signup failed');
	return data;
}

/**
 * Save gateway credentials to config file.
 */
export async function saveGatewayToken(token: string, user: GatewayAuthResult['user']): Promise<void> {
	const configPath = join(homedir(), '.clew', 'gateway.json');
	await writeFile(configPath, JSON.stringify({ token, user }, null, 2));
}

/**
 * Check if gateway auth is configured.
 */
export function isGatewayConfigured(): boolean {
	return !!process.env.CLEW_GATEWAY_URL || !!process.env.CLEW_GATEWAY_KEY;
}
