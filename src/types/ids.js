/**
 * Branded types for session and agent IDs.
 * These prevent accidentally mixing up session IDs and agent IDs at compile time.
 */
/**
 * Cast a raw string to SessionId.
 * Use sparingly - prefer getSessionId() when possible.
 */
export function asSessionId(id) {
    return id;
}
/**
 * Cast a raw string to AgentId.
 * Use sparingly - prefer createAgentId() when possible.
 */
export function asAgentId(id) {
    return id;
}
const AGENT_ID_PATTERN = /^a(?:.+-)?[0-9a-f]{16}$/;
/**
 * Validate and brand a string as AgentId.
 * Matches the format produced by createAgentId(): `a` + optional `<label>-` + 16 hex chars.
 * Returns null if the string doesn't match (e.g. teammate names, team-addressing).
 */
export function toAgentId(s) {
    return AGENT_ID_PATTERN.test(s) ? s : null;
}
