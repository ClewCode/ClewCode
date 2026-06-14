/**
 * Analytics service - public API for event logging
 *
 * This module serves as the main entry point for analytics events in Claude CLI.
 *
 * DESIGN: This module has NO dependencies to avoid import cycles.
 * Events are queued until attachAnalyticsSink() is called during app initialization.
 * The sink handles routing to Datadog and 1P event logging.
 */
/**
 * Strip `_PROTO_*` keys from a payload destined for general-access storage.
 * Used by:
 *   - sink.ts: before Datadog fanout (never sees PII-tagged values)
 *   - firstPartyEventLoggingExporter: defensive strip of additional_metadata
 *     after hoisting known _PROTO_* keys to proto fields — prevents a future
 *     unrecognized _PROTO_foo from silently landing in the BQ JSON blob.
 *
 * Returns the input unchanged (same reference) when no _PROTO_ keys present.
 */
export function stripProtoFields(metadata) {
    let result;
    for (const key in metadata) {
        if (key.startsWith('_PROTO_')) {
            if (result === undefined) {
                result = { ...metadata };
            }
            delete result[key];
        }
    }
    return result ?? metadata;
}
// Event queue for events logged before sink is attached
const eventQueue = [];
// Sink - initialized during app startup
let sink = null;
/**
 * Attach the analytics sink that will receive all events.
 * Queued events are drained asynchronously via queueMicrotask to avoid
 * adding latency to the startup path.
 *
 * Idempotent: if a sink is already attached, this is a no-op. This allows
 * calling from both the preAction hook (for subcommands) and setup() (for
 * the default command) without coordination.
 */
export function attachAnalyticsSink(newSink) {
    if (sink !== null) {
        return;
    }
    sink = newSink;
    // Drain the queue asynchronously to avoid blocking startup
    if (eventQueue.length > 0) {
        const queuedEvents = [...eventQueue];
        eventQueue.length = 0;
        // Log queue size for ants to help debug analytics initialization timing
        if (process.env.USER_TYPE === 'ant') {
            sink.logEvent('analytics_sink_attached', {
                queued_event_count: queuedEvents.length,
            });
        }
        queueMicrotask(() => {
            for (const event of queuedEvents) {
                if (event.async) {
                    void sink.logEventAsync(event.eventName, event.metadata);
                }
                else {
                    sink.logEvent(event.eventName, event.metadata);
                }
            }
        });
    }
}
/**
 * Log an event to analytics backends (synchronous)
 *
 * Events may be sampled based on the 'tengu_event_sampling_config' dynamic config.
 * When sampled, the sample_rate is added to the event metadata.
 *
 * If no sink is attached, events are queued and drained when the sink attaches.
 */
export function logEvent(eventName, 
// intentionally no strings unless AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
// to avoid accidentally logging code/filepaths
metadata) {
    if (sink === null) {
        eventQueue.push({ eventName, metadata, async: false });
        return;
    }
    sink.logEvent(eventName, metadata);
}
/**
 * Log an event to analytics backends (asynchronous)
 *
 * Events may be sampled based on the 'tengu_event_sampling_config' dynamic config.
 * When sampled, the sample_rate is added to the event metadata.
 *
 * If no sink is attached, events are queued and drained when the sink attaches.
 */
export async function logEventAsync(eventName, 
// intentionally no strings, to avoid accidentally logging code/filepaths
metadata) {
    if (sink === null) {
        eventQueue.push({ eventName, metadata, async: true });
        return;
    }
    await sink.logEventAsync(eventName, metadata);
}
/**
 * Reset analytics state for testing purposes only.
 * @internal
 */
export function _resetForTesting() {
    sink = null;
    eventQueue.length = 0;
}
