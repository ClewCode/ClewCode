/**
 * Tool validation configuration
 *
 * Most tools need NO configuration - basic validation works automatically.
 * Only add your tool here if it has special pattern requirements.
 */
export const TOOL_VALIDATION_CONFIG = {
    // File pattern tools (accept *.ts, src/**, etc.)
    filePatternTools: ['Read', 'Write', 'Edit', 'Glob', 'NotebookRead', 'NotebookEdit'],
    // Bash wildcard tools (accept * anywhere, and legacy command:* syntax)
    bashPrefixTools: ['Bash'],
    // Custom validation (only if needed)
    customValidation: {
        // WebSearch doesn't support wildcards or complex patterns
        WebSearch: content => {
            if (content.includes('*') || content.includes('?')) {
                return {
                    valid: false,
                    error: 'WebSearch does not support wildcards',
                    suggestion: 'Use exact search terms without * or ?',
                    examples: ['WebSearch(claude ai)', 'WebSearch(typescript tutorial)'],
                };
            }
            return { valid: true };
        },
        // WebFetch uses domain: prefix for hostname-based permissions
        WebFetch: content => {
            // Check if it's trying to use a URL format
            if (content.includes('://') || content.startsWith('http')) {
                return {
                    valid: false,
                    error: 'WebFetch permissions use domain format, not URLs',
                    suggestion: 'Use "domain:hostname" format',
                    examples: ['WebFetch(domain:example.com)', 'WebFetch(domain:github.com)'],
                };
            }
            // Must start with domain: prefix
            if (!content.startsWith('domain:')) {
                return {
                    valid: false,
                    error: 'WebFetch permissions must use "domain:" prefix',
                    suggestion: 'Use "domain:hostname" format',
                    examples: ['WebFetch(domain:example.com)', 'WebFetch(domain:*.google.com)'],
                };
            }
            // Allow wildcards in domain patterns
            // Valid: domain:*.example.com, domain:example.*, etc.
            return { valid: true };
        },
    },
};
// Helper to check if a tool uses file patterns
export function isFilePatternTool(toolName) {
    return TOOL_VALIDATION_CONFIG.filePatternTools.includes(toolName);
}
// Helper to check if a tool uses bash prefix patterns
export function isBashPrefixTool(toolName) {
    return TOOL_VALIDATION_CONFIG.bashPrefixTools.includes(toolName);
}
// Helper to get custom validation for a tool
export function getCustomValidation(toolName) {
    return TOOL_VALIDATION_CONFIG.customValidation[toolName];
}
