import { OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';
/**
 * Clew Gateway provider — routes through a self-hosted Clew Gateway instance.
 *
 * The gateway adds metadata headers (x-clew-*) to responses, which this
 * provider captures into _gateway_metadata on non-streaming responses.
 *
 * Env vars:
 * - CLEW_GATEWAY_URL: Gateway base URL (e.g. http://localhost:8787/v1)
 * - CLEW_GATEWAY_KEY: Virtual API key (e.g. clew_live_xxxxx)
 * - CLEW_MODEL: Optional default model alias (default: clew-code)
 */
export class ClewGatewayProvider extends OpenAICompatibleProvider {
    constructor() {
        super('clew-gateway', 'Clew Gateway', 'CLEW_GATEWAY_KEY', 'http://localhost:8787/v1', true);
    }
    /**
     * Capture gateway metadata headers from the raw HTTP response.
     * Headers are only available in the non-streaming path (the streaming
     * path reads the body incrementally before headers can be inspected).
     */
    normalizeResponse(data, response) {
        const result = super.normalizeResponse(data);
        if (response) {
            return {
                ...result,
                _gateway_metadata: {
                    provider: response.headers.get('x-clew-provider'),
                    model: response.headers.get('x-clew-model'),
                    fallbackUsed: response.headers.get('x-clew-fallback-used'),
                    attempts: response.headers.get('x-clew-attempts'),
                    chain: response.headers.get('x-clew-fallback-chain'),
                },
            };
        }
        return result;
    }
}
