/**
 * Frontmatter parser for markdown files
 * Extracts and parses YAML frontmatter between --- delimiters
 */
import { logForDebugging } from './debug.js';
import { parseYaml } from './yaml.js';
// Characters that require quoting in YAML values (when unquoted)
// - { } are flow mapping indicators
// - * is anchor/alias indicator
// - [ ] are flow sequence indicators
// - ': ' (colon followed by space) is key indicator — causes 'Nested mappings
//   are not allowed in compact mappings' when it appears mid-value. Match the
//   pattern rather than bare ':' so '12:34' times and 'https://' URLs stay unquoted.
// - # is comment indicator
// - & is anchor indicator
// - ! is tag indicator
// - | > are block scalar indicators (only at start)
// - % is directive indicator (only at start)
// - @ ` are reserved
const YAML_SPECIAL_CHARS = /[{}[\]*&#!|>%@`]|: /;
/**
 * Pre-processes frontmatter text to quote values that contain special YAML characters.
 * This allows glob patterns like **\/*.{ts,tsx} to be parsed correctly.
 */
function quoteProblematicValues(frontmatterText) {
    const lines = frontmatterText.split('\n');
    const result = [];
    for (const line of lines) {
        // Match simple key: value lines (not indented, not list items, not block scalars)
        const match = line.match(/^([a-zA-Z_-]+):\s+(.+)$/);
        if (match) {
            const [, key, value] = match;
            if (!key || !value) {
                result.push(line);
                continue;
            }
            // Skip if already quoted
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                result.push(line);
                continue;
            }
            // Quote if contains special YAML characters
            if (YAML_SPECIAL_CHARS.test(value)) {
                // Use double quotes and escape any existing double quotes
                const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
                result.push(`${key}: "${escaped}"`);
                continue;
            }
        }
        result.push(line);
    }
    return result.join('\n');
}
export const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)---\s*\n?/;
/**
 * Parses markdown content to extract frontmatter and content
 * @param markdown The raw markdown content
 * @returns Object containing parsed frontmatter and content without frontmatter
 */
export function parseFrontmatter(markdown, sourcePath) {
    const match = markdown.match(FRONTMATTER_REGEX);
    if (!match) {
        // No frontmatter found
        return {
            frontmatter: {},
            content: markdown,
        };
    }
    const frontmatterText = match[1] || '';
    const content = markdown.slice(match[0].length);
    let frontmatter = {};
    try {
        const parsed = parseYaml(frontmatterText);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            frontmatter = parsed;
        }
    }
    catch {
        // YAML parsing failed - try again after quoting problematic values
        try {
            const quotedText = quoteProblematicValues(frontmatterText);
            const parsed = parseYaml(quotedText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                frontmatter = parsed;
            }
        }
        catch (retryError) {
            // Still failed - log for debugging so users can diagnose broken frontmatter
            const location = sourcePath ? ` in ${sourcePath}` : '';
            logForDebugging(`Failed to parse YAML frontmatter${location}: ${retryError instanceof Error ? retryError.message : retryError}`, { level: 'warn' });
        }
    }
    return {
        frontmatter,
        content,
    };
}
/**
 * Splits a comma-separated string and expands brace patterns.
 * Commas inside braces are not treated as separators.
 * Also accepts a YAML list (string array) for ergonomic frontmatter.
 * @param input - Comma-separated string, or array of strings, with optional brace patterns
 * @returns Array of expanded strings
 * @example
 * splitPathInFrontmatter("a, b") // returns ["a", "b"]
 * splitPathInFrontmatter("a, src/*.{ts,tsx}") // returns ["a", "src/*.ts", "src/*.tsx"]
 * splitPathInFrontmatter("{a,b}/{c,d}") // returns ["a/c", "a/d", "b/c", "b/d"]
 * splitPathInFrontmatter(["a", "src/*.{ts,tsx}"]) // returns ["a", "src/*.ts", "src/*.tsx"]
 */
export function splitPathInFrontmatter(input) {
    if (Array.isArray(input)) {
        return input.flatMap(splitPathInFrontmatter);
    }
    if (typeof input !== 'string') {
        return [];
    }
    // Split by comma while respecting braces
    const parts = [];
    let current = '';
    let braceDepth = 0;
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === '{') {
            braceDepth++;
            current += char;
        }
        else if (char === '}') {
            braceDepth--;
            current += char;
        }
        else if (char === ',' && braceDepth === 0) {
            // Split here - we're at a comma outside of braces
            const trimmed = current.trim();
            if (trimmed) {
                parts.push(trimmed);
            }
            current = '';
        }
        else {
            current += char;
        }
    }
    // Add the last part
    const trimmed = current.trim();
    if (trimmed) {
        parts.push(trimmed);
    }
    // Expand brace patterns in each part
    return parts.filter(p => p.length > 0).flatMap(pattern => expandBraces(pattern));
}
/**
 * Expands brace patterns in a glob string.
 * @example
 * expandBraces("src/*.{ts,tsx}") // returns ["src/*.ts", "src/*.tsx"]
 * expandBraces("{a,b}/{c,d}") // returns ["a/c", "a/d", "b/c", "b/d"]
 */
function expandBraces(pattern) {
    // Find the first brace group
    const braceMatch = pattern.match(/^([^{]*)\{([^}]+)\}(.*)$/);
    if (!braceMatch) {
        // No braces found, return pattern as-is
        return [pattern];
    }
    const prefix = braceMatch[1] || '';
    const alternatives = braceMatch[2] || '';
    const suffix = braceMatch[3] || '';
    // Split alternatives by comma and expand each one
    const parts = alternatives.split(',').map(alt => alt.trim());
    // Recursively expand remaining braces in suffix
    const expanded = [];
    for (const part of parts) {
        const combined = prefix + part + suffix;
        // Recursively handle additional brace groups
        const furtherExpanded = expandBraces(combined);
        expanded.push(...furtherExpanded);
    }
    return expanded;
}
/**
 * Parses a positive integer value from frontmatter.
 * Handles both number and string representations.
 *
 * @param value The raw value from frontmatter (could be number, string, or undefined)
 * @returns The parsed positive integer, or undefined if invalid or not provided
 */
export function parsePositiveIntFromFrontmatter(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }
    return undefined;
}
/**
 * Validate and coerce a description value from frontmatter.
 *
 * Strings are returned as-is (trimmed). Primitive values (numbers, booleans)
 * are coerced to strings via String(). Non-scalar values (arrays, objects)
 * are invalid and are logged then omitted. Null, undefined, and
 * empty/whitespace-only strings return null so callers can fall back to
 * a default.
 *
 * @param value - The raw frontmatter description value
 * @param componentName - The skill/command/agent/style name for log messages
 * @param pluginName - The plugin name, if this came from a plugin
 */
export function coerceDescriptionToString(value, componentName, pluginName) {
    if (value == null) {
        return null;
    }
    if (typeof value === 'string') {
        return value.trim() || null;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    // Non-scalar descriptions (arrays, objects) are invalid — log and omit
    const source = pluginName ? `${pluginName}:${componentName}` : (componentName ?? 'unknown');
    logForDebugging(`Description invalid for ${source} - omitting`, {
        level: 'warn',
    });
    return null;
}
/**
 * Parse a boolean frontmatter value.
 * Only returns true for literal true or "true" string.
 */
export function parseBooleanFrontmatter(value) {
    return value === true || value === 'true';
}
const FRONTMATTER_SHELLS = ['bash', 'powershell'];
/**
 * Parse and validate the `shell:` frontmatter field.
 *
 * Returns undefined for absent/null/empty (caller defaults to bash).
 * Logs a warning and returns undefined for unrecognized values — we fall
 * back to bash rather than failing the skill load, matching how `effort`
 * and other fields degrade.
 */
export function parseShellFrontmatter(value, source) {
    if (value == null) {
        return undefined;
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === '') {
        return undefined;
    }
    if (FRONTMATTER_SHELLS.includes(normalized)) {
        return normalized;
    }
    logForDebugging(`Frontmatter 'shell: ${value}' in ${source} is not recognized. Valid values: ${FRONTMATTER_SHELLS.join(', ')}. Falling back to bash.`, { level: 'warn' });
    return undefined;
}
