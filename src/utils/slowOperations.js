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
import { feature } from 'bun:bundle';
import { closeSync, writeFileSync as fsWriteFileSync, fsyncSync, openSync } from 'fs';
// biome-ignore lint: This file IS the cloneDeep wrapper - it must import the original
import lodashCloneDeep from 'lodash-es/cloneDeep.js';
import { addSlowOperation } from '../bootstrap/state.js';
import { logForDebugging } from './debug.js';
// --- Slow operation logging infrastructure ---
/**
 * Threshold in milliseconds for logging slow JSON/clone operations.
 * Operations taking longer than this will be logged for debugging.
 * - Override: set CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS to a number
 * - Dev builds: 20ms (lower threshold for development)
 * - Ants: 300ms (enabled for all internal users)
 */
const SLOW_OPERATION_THRESHOLD_MS = (() => {
    const envValue = process.env.CLAUDE_CODE_SLOW_OPERATION_THRESHOLD_MS;
    if (envValue !== undefined) {
        const parsed = Number(envValue);
        if (!Number.isNaN(parsed) && parsed >= 0) {
            return parsed;
        }
    }
    if (process.env.NODE_ENV === 'development') {
        return 20;
    }
    if (process.env.USER_TYPE === 'ant') {
        return 300;
    }
    return Infinity;
})();
// Re-export for callers that still need the threshold value directly
export { SLOW_OPERATION_THRESHOLD_MS };
// Module-level re-entrancy guard. logForDebugging writes to a debug file via
// appendFileSync, which goes through slowLogging again. Without this guard,
// a slow appendFileSync → dispose → logForDebugging → appendFileSync → dispose → ...
let isLogging = false;
/**
 * Extract the first stack frame outside this file, so the DevBar warning
 * points at the actual caller instead of a useless `Object{N keys}`.
 * Only called when an operation was actually slow — never on the fast path.
 */
export function callerFrame(stack) {
    if (!stack)
        return '';
    for (const line of stack.split('\n')) {
        if (line.includes('slowOperations'))
            continue;
        const m = line.match(/([^/\\]+?):(\d+):\d+\)?$/);
        if (m)
            return ` @ ${m[1]}:${m[2]}`;
    }
    return '';
}
/**
 * Builds a human-readable description from tagged template arguments.
 * Only called when an operation was actually slow — never on the fast path.
 *
 * args[0] = TemplateStringsArray, args[1..n] = interpolated values
 */
function buildDescription(args) {
    const strings = args[0];
    let result = '';
    for (let i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i + 1 < args.length) {
            const v = args[i + 1];
            if (Array.isArray(v)) {
                result += `Array[${v.length}]`;
            }
            else if (v !== null && typeof v === 'object') {
                result += `Object{${Object.keys(v).length} keys}`;
            }
            else if (typeof v === 'string') {
                result += v.length > 80 ? `${v.slice(0, 80)}…` : v;
            }
            else {
                result += String(v);
            }
        }
    }
    return result;
}
class AntSlowLogger {
    startTime;
    args;
    err;
    constructor(args) {
        this.startTime = performance.now();
        this.args = args;
        // V8/JSC capture the stack at construction but defer the expensive string
        // formatting until .stack is read — so this stays off the fast path.
        this.err = new Error();
    }
    [Symbol.dispose]() {
        const duration = performance.now() - this.startTime;
        if (duration > SLOW_OPERATION_THRESHOLD_MS && !isLogging) {
            isLogging = true;
            try {
                const description = buildDescription(this.args) + callerFrame(this.err.stack);
                logForDebugging(`[SLOW OPERATION DETECTED] ${description} (${duration.toFixed(1)}ms)`);
                addSlowOperation(description, duration);
            }
            finally {
                isLogging = false;
            }
        }
    }
}
const NOOP_LOGGER = { [Symbol.dispose]() { } };
// Must be regular functions (not arrows) to access `arguments`
function slowLoggingAnt(_strings, ..._values) {
    // eslint-disable-next-line prefer-rest-params
    return new AntSlowLogger(arguments);
}
function slowLoggingExternal() {
    return NOOP_LOGGER;
}
/**
 * Tagged template for slow operation logging.
 *
 * In ANT builds: creates an AntSlowLogger that times the operation and logs
 * if it exceeds the threshold. Description is built lazily only when slow.
 *
 * In external builds: returns a singleton no-op disposable. Zero allocations,
 * zero timing. AntSlowLogger and buildDescription are dead-code-eliminated.
 *
 * @example
 * using _ = slowLogging`structuredClone(${value})`
 * const result = structuredClone(value)
 */
export const slowLogging = feature('SLOW_OPERATION_LOGGING')
    ? slowLoggingAnt
    : slowLoggingExternal;
export function jsonStringify(value, replacer, space) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const _ = __addDisposableResource(env_1, slowLogging `JSON.stringify(${value})`, false);
        return JSON.stringify(value, replacer, space);
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
/**
 * Wrapped JSON.parse with slow operation logging.
 * Use this instead of JSON.parse directly to detect performance issues.
 *
 * @example
 * import { jsonParse } from './slowOperations.js'
 * const data = jsonParse(jsonString)
 */
export const jsonParse = (text, reviver) => {
    const env_2 = { stack: [], error: void 0, hasError: false };
    try {
        const _ = __addDisposableResource(env_2, slowLogging `JSON.parse(${text})`, false);
        // V8 de-opts JSON.parse when a second argument is passed, even if undefined.
        // Branch explicitly so the common (no-reviver) path stays on the fast path.
        return typeof reviver === 'undefined' ? JSON.parse(text) : JSON.parse(text, reviver);
    }
    catch (e_2) {
        env_2.error = e_2;
        env_2.hasError = true;
    }
    finally {
        __disposeResources(env_2);
    }
};
/**
 * Wrapped structuredClone with slow operation logging.
 * Use this instead of structuredClone directly to detect performance issues.
 *
 * @example
 * import { clone } from './slowOperations.js'
 * const copy = clone(originalObject)
 */
export function clone(value, options) {
    const env_3 = { stack: [], error: void 0, hasError: false };
    try {
        const _ = __addDisposableResource(env_3, slowLogging `structuredClone(${value})`, false);
        return structuredClone(value, options);
    }
    catch (e_3) {
        env_3.error = e_3;
        env_3.hasError = true;
    }
    finally {
        __disposeResources(env_3);
    }
}
/**
 * Wrapped cloneDeep with slow operation logging.
 * Use this instead of lodash cloneDeep directly to detect performance issues.
 *
 * @example
 * import { cloneDeep } from './slowOperations.js'
 * const copy = cloneDeep(originalObject)
 */
export function cloneDeep(value) {
    const env_4 = { stack: [], error: void 0, hasError: false };
    try {
        const _ = __addDisposableResource(env_4, slowLogging `cloneDeep(${value})`, false);
        return lodashCloneDeep(value);
    }
    catch (e_4) {
        env_4.error = e_4;
        env_4.hasError = true;
    }
    finally {
        __disposeResources(env_4);
    }
}
/**
 * Wrapper around fs.writeFileSync with slow operation logging.
 * Supports flush option to ensure data is written to disk before returning.
 * @param filePath The path to the file to write to
 * @param data The data to write (string or Buffer)
 * @param options Optional write options (encoding, mode, flag, flush)
 * @deprecated Use `fs.promises.writeFile` instead for non-blocking writes.
 * Sync file writes block the event loop and cause performance issues.
 */
export function writeFileSync_DEPRECATED(filePath, data, options) {
    const env_5 = { stack: [], error: void 0, hasError: false };
    try {
        const _ = __addDisposableResource(env_5, slowLogging `fs.writeFileSync(${filePath}, ${data})`, false);
        // Check if flush is requested (for object-style options)
        const needsFlush = options !== null && typeof options === 'object' && 'flush' in options && options.flush === true;
        if (needsFlush) {
            // Manual flush: open file, write, fsync, close
            const encoding = typeof options === 'object' && 'encoding' in options ? options.encoding : undefined;
            const mode = typeof options === 'object' && 'mode' in options ? options.mode : undefined;
            let fd;
            try {
                fd = openSync(filePath, 'w', mode);
                fsWriteFileSync(fd, data, { encoding: encoding ?? undefined });
                fsyncSync(fd);
            }
            finally {
                if (fd !== undefined) {
                    closeSync(fd);
                }
            }
        }
        else {
            // No flush needed, use standard writeFileSync
            fsWriteFileSync(filePath, data, options);
        }
    }
    catch (e_5) {
        env_5.error = e_5;
        env_5.hasError = true;
    }
    finally {
        __disposeResources(env_5);
    }
}
