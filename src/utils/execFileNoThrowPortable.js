var __addDisposableResource = (this && this.__addDisposableResource) || ((env, value, async) => {
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
});
var __disposeResources = (this && this.__disposeResources) || ((SuppressedError) => (env) => {
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
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, (e) => { fail(e); return next(); });
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
    })(typeof SuppressedError === "function" ? SuppressedError : ((error, suppressed, message) => {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
}));
import { execaSync } from 'execa';
import { getCwd } from '../utils/cwd.js';
import { slowLogging } from './slowOperations.js';
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
/**
 * @deprecated Use `execa` directly with `{ shell: true, reject: false }` for non-blocking execution.
 * Sync exec calls block the event loop and cause performance issues.
 */
export function execSyncWithDefaults_DEPRECATED(command, optionsOrAbortSignal, timeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        let options;
        if (optionsOrAbortSignal === undefined) {
            // No second argument - use defaults
            options = {};
        }
        else if (optionsOrAbortSignal instanceof AbortSignal) {
            // Old signature - second argument is AbortSignal
            options = {
                abortSignal: optionsOrAbortSignal,
                timeout,
            };
        }
        else {
            // New signature - second argument is options object
            options = optionsOrAbortSignal;
        }
        const { abortSignal, timeout: finalTimeout = 10 * SECONDS_IN_MINUTE * MS_IN_SECOND, input, stdio = ['ignore', 'pipe', 'pipe'], } = options;
        abortSignal?.throwIfAborted();
        const _ = __addDisposableResource(env_1, slowLogging `exec: ${command.slice(0, 200)}`, false);
        try {
            const result = execaSync(command, {
                env: process.env,
                maxBuffer: 1_000_000,
                timeout: finalTimeout,
                cwd: getCwd(),
                stdio,
                shell: true, // execSync typically runs shell commands
                reject: false, // Don't throw on non-zero exit codes
                input,
            });
            if (!result.stdout) {
                return null;
            }
            return result.stdout.trim() || null;
        }
        catch {
            return null;
        }
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
