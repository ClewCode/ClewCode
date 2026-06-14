var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { open, readFile, stat } from 'fs/promises';
import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser/lib/esm/main.js';
import { stripBOM } from './jsonRead.js';
import { logError } from './log.js';
import { memoizeWithLRU } from './memoize.js';
import { jsonStringify } from './slowOperations.js';
/**
 * Remove lone surrogate characters from a string. These can appear when a
 * session is truncated mid-emoji by an unclean shutdown, and will crash
 * downstream operations (TextEncoder, Buffer.from) with "no low surrogate".
 */
function sanitizeSurrogates(text) {
    // Matches lone high surrogates (0xD800–0xDBFF) not followed by a low
    // surrogate (0xDC00–0xDFFF), and lone low surrogates not preceded by a
    // high surrogate. Both cases are invalid in UTF-8/UTF-16.
    return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|[\uDC00-\uDFFF]/g, '');
}
// Memoized inner parse. Uses a discriminated-union wrapper because:
// 1. memoizeWithLRU requires NonNullable<unknown>, but JSON.parse can return
//    null (e.g. JSON.parse("null")).
// 2. Invalid JSON must also be cached — otherwise repeated calls with the same
//    bad string re-parse and re-log every time (behavioral regression vs the
//    old lodash memoize which wrapped the entire try/catch).
// Bounded to 50 entries to prevent unbounded memory growth — previously this
// used lodash memoize which cached every unique JSON string forever (settings,
// .mcp.json, notebooks, tool results), causing a significant memory leak.
// Note: shouldLogError is intentionally excluded from the cache key (matching
// lodash memoize default resolver = first arg only).
// Skip caching above this size — the LRU stores the full string as the key,
// so a 200KB config file would pin ~10MB in #keyList across 50 slots. Large
// inputs like ~/.claude.json also change between reads (numStartups bumps on
// every CC startup), so the cache never hits anyway.
const PARSE_CACHE_MAX_KEY_BYTES = 8 * 1024;
function parseJSONUncached(json, shouldLogError) {
    try {
        return { ok: true, value: JSON.parse(stripBOM(json)) };
    }
    catch (e) {
        if (shouldLogError) {
            logError(e);
        }
        return { ok: false };
    }
}
const parseJSONCached = memoizeWithLRU(parseJSONUncached, json => json, 50);
// Important: memoized for performance (LRU-bounded to 50 entries, small inputs only).
export const safeParseJSON = Object.assign(function safeParseJSON(json, shouldLogError = true) {
    if (!json)
        return null;
    const result = json.length > PARSE_CACHE_MAX_KEY_BYTES
        ? parseJSONUncached(json, shouldLogError)
        : parseJSONCached(json, shouldLogError);
    return result.ok ? result.value : null;
}, { cache: parseJSONCached.cache });
/**
 * Safely parse JSON with comments (jsonc).
 * This is useful for VS Code configuration files like keybindings.json
 * which support comments and other jsonc features.
 */
export function safeParseJSONC(json) {
    if (!json) {
        return null;
    }
    try {
        // Strip BOM before parsing - PowerShell 5.x adds BOM to UTF-8 files
        return parseJsonc(stripBOM(json));
    }
    catch (e) {
        logError(e);
        return null;
    }
}
const bunJSONLParse = (() => {
    if (typeof Bun === 'undefined')
        return false;
    const b = Bun;
    const jsonl = b.JSONL;
    if (!jsonl?.parseChunk)
        return false;
    return jsonl.parseChunk;
})();
function parseJSONLBun(data) {
    const parse = bunJSONLParse;
    const len = data.length;
    const result = parse(data);
    if (!result.error || result.done || result.read >= len) {
        return result.values;
    }
    // Had an error mid-stream — collect what we got and keep going
    let values = result.values;
    let offset = result.read;
    while (offset < len) {
        const newlineIndex = typeof data === 'string' ? data.indexOf('\n', offset) : data.indexOf(0x0a, offset);
        if (newlineIndex === -1)
            break;
        offset = newlineIndex + 1;
        const next = parse(data, offset);
        if (next.values.length > 0) {
            values = values.concat(next.values);
        }
        if (!next.error || next.done || next.read >= len)
            break;
        offset = next.read;
    }
    return values;
}
function parseJSONLBuffer(buf) {
    const bufLen = buf.length;
    let start = 0;
    // Strip UTF-8 BOM (EF BB BF)
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        start = 3;
    }
    const results = [];
    while (start < bufLen) {
        let end = buf.indexOf(0x0a, start);
        if (end === -1)
            end = bufLen;
        const raw = buf.toString('utf8', start, end);
        const line = sanitizeSurrogates(raw).trim();
        start = end + 1;
        if (!line)
            continue;
        try {
            results.push(JSON.parse(line));
        }
        catch {
            // Skip malformed lines
        }
    }
    return results;
}
function parseJSONLString(data) {
    const stripped = stripBOM(data);
    const len = stripped.length;
    let start = 0;
    const results = [];
    while (start < len) {
        let end = stripped.indexOf('\n', start);
        if (end === -1)
            end = len;
        const line = sanitizeSurrogates(stripped.substring(start, end)).trim();
        start = end + 1;
        if (!line)
            continue;
        try {
            results.push(JSON.parse(line));
        }
        catch {
            // Skip malformed lines
        }
    }
    return results;
}
/**
 * Parses JSONL data from a string or Buffer, skipping malformed lines.
 * Uses Bun.JSONL.parseChunk when available for better performance,
 * falls back to indexOf-based scanning otherwise.
 */
export function parseJSONL(data) {
    if (bunJSONLParse) {
        return parseJSONLBun(data);
    }
    if (typeof data === 'string') {
        return parseJSONLString(data);
    }
    return parseJSONLBuffer(data);
}
const MAX_JSONL_READ_BYTES = 100 * 1024 * 1024;
/**
 * Reads and parses a JSONL file, reading at most the last 100 MB.
 * For files larger than 100 MB, reads the tail and skips the first partial line.
 *
 * 100 MB is more than sufficient since the longest context window we support
 * is ~2M tokens, which is well under 100 MB of JSONL.
 */
export async function readJSONLFile(filePath) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const { size } = await stat(filePath);
        if (size <= MAX_JSONL_READ_BYTES) {
            return parseJSONL(await readFile(filePath));
        }
        const fd = __addDisposableResource(env_1, await open(filePath, 'r'), true);
        const buf = Buffer.allocUnsafe(MAX_JSONL_READ_BYTES);
        let totalRead = 0;
        const fileOffset = size - MAX_JSONL_READ_BYTES;
        while (totalRead < MAX_JSONL_READ_BYTES) {
            const { bytesRead } = await fd.read(buf, totalRead, MAX_JSONL_READ_BYTES - totalRead, fileOffset + totalRead);
            if (bytesRead === 0)
                break;
            totalRead += bytesRead;
        }
        // Skip the first partial line
        const newlineIndex = buf.indexOf(0x0a);
        if (newlineIndex !== -1 && newlineIndex < totalRead - 1) {
            return parseJSONL(buf.subarray(newlineIndex + 1, totalRead));
        }
        return parseJSONL(buf.subarray(0, totalRead));
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_1);
        if (result_1)
            await result_1;
    }
}
export function addItemToJSONCArray(content, newItem) {
    try {
        // If the content is empty or whitespace, create a new JSON file
        if (!content || content.trim() === '') {
            return jsonStringify([newItem], null, 4);
        }
        // Strip BOM before parsing - PowerShell 5.x adds BOM to UTF-8 files
        const cleanContent = stripBOM(content);
        // Parse the content to check if it's valid JSON
        const parsedContent = parseJsonc(cleanContent);
        // If the parsed content is a valid array, modify it
        if (Array.isArray(parsedContent)) {
            // Get the length of the array
            const arrayLength = parsedContent.length;
            // Determine if we are dealing with an empty array
            const isEmpty = arrayLength === 0;
            // If it's an empty array we want to add at index 0, otherwise append to the end
            const insertPath = isEmpty ? [0] : [arrayLength];
            // Generate edits - we're using isArrayInsertion to add a new item without overwriting existing ones
            const edits = modify(cleanContent, insertPath, newItem, {
                formattingOptions: { insertSpaces: true, tabSize: 4 },
                isArrayInsertion: true,
            });
            // If edits could not be generated, fall back to manual JSON string manipulation
            if (!edits || edits.length === 0) {
                const copy = [...parsedContent, newItem];
                return jsonStringify(copy, null, 4);
            }
            // Apply the edits to preserve comments (use cleanContent without BOM)
            return applyEdits(cleanContent, edits);
        }
        // If it's not an array at all, create a new array with the item
        else {
            // If the content exists but is not an array, we'll replace it completely
            return jsonStringify([newItem], null, 4);
        }
    }
    catch (e) {
        // If parsing fails for any reason, log the error and fallback to creating a new JSON array
        logError(e);
        return jsonStringify([newItem], null, 4);
    }
}
