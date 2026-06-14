/**
 * Session Memory utility functions that can be imported without circular dependencies.
 * These are separate from the main sessionMemory.ts to avoid importing runAgent.
 */
import { isFsInaccessible } from '../../utils/errors.js';
import { getFsImplementation } from '../../utils/fsOperations.js';
import { getSessionMemoryPath } from '../../utils/permissions/filesystem.js';
import { sleep } from '../../utils/sleep.js';
import { logEvent } from '../analytics/index.js';
const EXTRACTION_WAIT_TIMEOUT_MS = 15000;
const EXTRACTION_STALE_THRESHOLD_MS = 60000; // 1 minute
// Default configuration values
export const DEFAULT_SESSION_MEMORY_CONFIG = {
    minimumMessageTokensToInit: 10000,
    minimumTokensBetweenUpdate: 5000,
    toolCallsBetweenUpdates: 3,
};
// Current session memory configuration
let sessionMemoryConfig = {
    ...DEFAULT_SESSION_MEMORY_CONFIG,
};
// Track the last summarized message ID (shared state)
let lastSummarizedMessageId;
// Track extraction state with timestamp (set by sessionMemory.ts)
let extractionStartedAt;
// Track context size at last memory extraction (for minimumTokensBetweenUpdate)
let tokensAtLastExtraction = 0;
// Track whether session memory has been initialized (met minimumMessageTokensToInit)
let sessionMemoryInitialized = false;
/**
 * Get the message ID up to which the session memory is current
 */
export function getLastSummarizedMessageId() {
    return lastSummarizedMessageId;
}
/**
 * Set the last summarized message ID (called from sessionMemory.ts)
 */
export function setLastSummarizedMessageId(messageId) {
    lastSummarizedMessageId = messageId;
}
/**
 * Mark extraction as started (called from sessionMemory.ts)
 */
export function markExtractionStarted() {
    extractionStartedAt = Date.now();
}
/**
 * Mark extraction as completed (called from sessionMemory.ts)
 */
export function markExtractionCompleted() {
    extractionStartedAt = undefined;
}
/**
 * Wait for any in-progress session memory extraction to complete (with 15s timeout)
 * Returns immediately if no extraction is in progress or if extraction is stale (>1min old).
 */
export async function waitForSessionMemoryExtraction() {
    const startTime = Date.now();
    while (extractionStartedAt) {
        const extractionAge = Date.now() - extractionStartedAt;
        if (extractionAge > EXTRACTION_STALE_THRESHOLD_MS) {
            // Extraction is stale, don't wait
            return;
        }
        if (Date.now() - startTime > EXTRACTION_WAIT_TIMEOUT_MS) {
            // Timeout - continue anyway
            return;
        }
        await sleep(1000);
    }
}
/**
 * Get the current session memory content
 */
export async function getSessionMemoryContent() {
    const fs = getFsImplementation();
    const memoryPath = getSessionMemoryPath();
    try {
        const content = await fs.readFile(memoryPath, { encoding: 'utf-8' });
        logEvent('tengu_session_memory_loaded', {
            content_length: content.length,
        });
        return content;
    }
    catch (e) {
        if (isFsInaccessible(e))
            return null;
        throw e;
    }
}
/**
 * Set the session memory configuration
 */
export function setSessionMemoryConfig(config) {
    sessionMemoryConfig = {
        ...sessionMemoryConfig,
        ...config,
    };
}
/**
 * Get the current session memory configuration
 */
export function getSessionMemoryConfig() {
    return { ...sessionMemoryConfig };
}
/**
 * Record the context size at the time of extraction.
 * Used to measure context growth for minimumTokensBetweenUpdate threshold.
 */
export function recordExtractionTokenCount(currentTokenCount) {
    tokensAtLastExtraction = currentTokenCount;
}
/**
 * Check if session memory has been initialized (met minimumTokensToInit threshold)
 */
export function isSessionMemoryInitialized() {
    return sessionMemoryInitialized;
}
/**
 * Mark session memory as initialized
 */
export function markSessionMemoryInitialized() {
    sessionMemoryInitialized = true;
}
/**
 * Check if we've met the threshold to initialize session memory.
 * Uses total context window tokens (same as autocompact) for consistent behavior.
 */
export function hasMetInitializationThreshold(currentTokenCount) {
    return currentTokenCount >= sessionMemoryConfig.minimumMessageTokensToInit;
}
/**
 * Check if we've met the threshold for the next update.
 * Measures actual context window growth since last extraction
 * (same metric as autocompact and initialization threshold).
 */
export function hasMetUpdateThreshold(currentTokenCount) {
    const tokensSinceLastExtraction = currentTokenCount - tokensAtLastExtraction;
    return tokensSinceLastExtraction >= sessionMemoryConfig.minimumTokensBetweenUpdate;
}
/**
 * Get the configured number of tool calls between updates
 */
export function getToolCallsBetweenUpdates() {
    return sessionMemoryConfig.toolCallsBetweenUpdates;
}
/**
 * Reset session memory state (useful for testing)
 */
export function resetSessionMemoryState() {
    sessionMemoryConfig = { ...DEFAULT_SESSION_MEMORY_CONFIG };
    tokensAtLastExtraction = 0;
    sessionMemoryInitialized = false;
    lastSummarizedMessageId = undefined;
    extractionStartedAt = undefined;
}
