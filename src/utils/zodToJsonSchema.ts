/**
 * Converts Zod v4 schemas to JSON Schema using native toJSONSchema.
 *
 * Note: Zod v4's toJSONSchema may generate regex patterns with lookahead
 * assertions (e.g., for z.string().url()), which are NOT valid in JSON Schema
 * (ECMA-262 regex, no lookahead). Some providers (DeepSeek, others) reject
 * these. We strip lookahead assertions to ensure provider compatibility.
 */

import { toJSONSchema, type ZodTypeAny } from 'zod/v4';

export type JsonSchema7Type = Record<string, unknown>;

// toolToAPISchema() runs this for every tool on every API request (~60-250
// times/turn). Tool schemas are wrapped with lazySchema() which guarantees the
// same ZodTypeAny reference per session, so we can cache by identity.
const cache = new WeakMap<ZodTypeAny, JsonSchema7Type>();

/**
 * Strip regex lookahead/lookbehind assertions from JSON Schema pattern strings.
 * JSON Schema uses ECMA-262 regex which does NOT support (?=...), (?!...),
 * (?<=...), or (?<!...). Some providers (DeepSeek, OpenRouter) reject schemas
 * containing these.
 */
function stripLookahead(pattern: string): string {
  // Strip positive lookahead (?=...) and negative lookahead (?!...)
  // Also strip positive lookbehind (?<=...) and negative lookbehind (?<!...)
  return pattern.replace(/\(\?[=!<][^)]*\)/g, '');
}

/**
 * Recursively sanitize a JSON Schema object, stripping lookahead assertions
 * from all pattern fields.
 */
function sanitizeSchema(obj: JsonSchema7Type): JsonSchema7Type {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (key === 'pattern' && typeof value === 'string') {
      obj[key] = stripLookahead(value);
    } else if (value !== null && typeof value === 'object') {
      sanitizeSchema(value as JsonSchema7Type);
    }
  }
  return obj;
}

/**
 * Converts a Zod v4 schema to JSON Schema format.
 * Sanitizes the result to remove regex features not supported by JSON Schema.
 */
export function zodToJsonSchema(schema: ZodTypeAny): JsonSchema7Type {
  if (!schema || !(schema as Record<string, unknown>)._zod) {
    if (schema) {
      console.warn(
        `[zodToJsonSchema] Non-Zod schema received (type: ${typeof schema}, constructor: ${(schema as any)?.constructor?.name})`,
      );
    }
    return { type: 'object', properties: {} };
  }
  const hit = cache.get(schema);
  if (hit) return hit;
  const result = sanitizeSchema(toJSONSchema(schema) as JsonSchema7Type);
  cache.set(schema, result);
  return result;
}
