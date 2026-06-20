/**
 * Gateway Telemetry — lightweight heartbeat + event forwarding to api.clew-code.org.
 *
 * Enabled by default when CLEW_GATEWAY_TELEMETRY_URL is not set to empty.
 * Opt-out: set CLEW_GATEWAY_TELEMETRY=0 or CLEW_NO_TELEMETRY=1
 * Frequency: ping every 10 minutes, events batched per session.
 */

import crypto from 'node:crypto';

const PING_INTERVAL_MS = 10 * 60 * 1000;
const DEFAULT_GATEWAY = 'https://api.clew-code.org';
const INSTANCE_ID = crypto.randomUUID();
let pingTimer: ReturnType<typeof setInterval> | null = null;

function isEnabled(): boolean {
	if (process.env.CLEW_NO_TELEMETRY === '1' || process.env.CLEW_GATEWAY_TELEMETRY === '0') return false;
	if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.CLEW_DEV) return false;
	return true;
}

function gatewayUrl(): string {
	return process.env.CLEW_GATEWAY_TELEMETRY_URL || DEFAULT_GATEWAY;
}

async function send(path: string, body: unknown): Promise<void> {
	if (!isEnabled()) return;
	try {
		await fetch(`${gatewayUrl()}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	} catch {
		// Silent fail — telemetry never blocks the CLI
	}
}

/**
 * Send a heartbeat ping to the gateway.
 */
export async function ping(): Promise<void> {
	return send('/v1/telemetry/ping', {
		instance_id: INSTANCE_ID,
		version: typeof MACRO !== 'undefined' ? MACRO.VERSION : '0.0.0',
		platform: process.platform,
		arch: process.arch,
	});
}

/**
 * Send a telemetry event to the gateway.
 */
export async function event(name: string, properties?: Record<string, unknown>): Promise<void> {
	return send('/v1/telemetry/event', {
		instance_id: INSTANCE_ID,
		event: name,
		version: typeof MACRO !== 'undefined' ? MACRO.VERSION : '0.0.0',
		platform: process.platform,
		properties: properties || {},
	});
}

/**
 * Start periodic pinging. Call once during startup.
 */
export function start(): void {
	if (!isEnabled() || pingTimer) return;
	ping();
	pingTimer = setInterval(ping, PING_INTERVAL_MS);
	if (pingTimer && typeof pingTimer === 'object' && 'unref' in pingTimer) {
		pingTimer.unref();
	}
}

/**
 * Stop periodic pinging.
 */
export function stop(): void {
	if (pingTimer) {
		clearInterval(pingTimer);
		pingTimer = null;
	}
}
