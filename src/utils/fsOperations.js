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
import * as fs from 'fs';
import { mkdir as mkdirPromise, open, readdir as readdirPromise, readFile as readFilePromise, rename as renamePromise, rmdir as rmdirPromise, rm as rmPromise, stat as statPromise, unlink as unlinkPromise, } from 'fs/promises';
import { homedir } from 'os';
import * as nodePath from 'path';
import { getErrnoCode } from './errors.js';
import { slowLogging } from './slowOperations.js';
/**
 * Safely resolves a file path, handling symlinks and errors gracefully.
 *
 * Error handling strategy:
 * - If the file doesn't exist, returns the original path (allows for file creation)
 * - If symlink resolution fails (broken symlink, permission denied, circular links),
 *   returns the original path and marks it as not a symlink
 * - This ensures operations can continue with the original path rather than failing
 *
 * @param fs The filesystem implementation to use
 * @param filePath The path to resolve
 * @returns Object containing the resolved path and whether it was a symlink
 */
export function safeResolvePath(fs, filePath) {
    // Block UNC paths before any filesystem access to prevent network
    // requests (DNS/SMB) during validation on Windows
    if (filePath.startsWith('//') || filePath.startsWith('\\\\')) {
        return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
    }
    try {
        // Check for special file types (FIFOs, sockets, devices) before calling realpathSync.
        // realpathSync can block on FIFOs waiting for a writer, causing hangs.
        // If the file doesn't exist, lstatSync throws ENOENT which the catch
        // below handles by returning the original path (allows file creation).
        const stats = fs.lstatSync(filePath);
        if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
            return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
        }
        const resolvedPath = fs.realpathSync(filePath);
        return {
            resolvedPath,
            isSymlink: resolvedPath !== filePath,
            // realpathSync returned: resolvedPath is canonical (all symlinks in
            // all path components resolved). Callers can skip further symlink
            // resolution on this path.
            isCanonical: true,
        };
    }
    catch (_error) {
        // If lstat/realpath fails for any reason (ENOENT, broken symlink,
        // EACCES, ELOOP, etc.), return the original path to allow operations
        // to proceed
        return { resolvedPath: filePath, isSymlink: false, isCanonical: false };
    }
}
/**
 * Check if a file path is a duplicate and should be skipped.
 * Resolves symlinks to detect duplicates pointing to the same file.
 * If not a duplicate, adds the resolved path to loadedPaths.
 *
 * @returns true if the file should be skipped (is duplicate)
 */
export function isDuplicatePath(fs, filePath, loadedPaths) {
    const { resolvedPath } = safeResolvePath(fs, filePath);
    if (loadedPaths.has(resolvedPath)) {
        return true;
    }
    loadedPaths.add(resolvedPath);
    return false;
}
/**
 * Resolve the deepest existing ancestor of a path via realpathSync, walking
 * up until it succeeds. Detects dangling symlinks (link entry exists, target
 * doesn't) via lstat and resolves them via readlink.
 *
 * Use when the input path may not exist (new file writes) and you need to
 * know where the write would ACTUALLY land after the OS follows symlinks.
 *
 * Returns the resolved absolute path with non-existent tail segments
 * rejoined, or undefined if no symlink was found in any existing ancestor
 * (the path's existing ancestors all resolve to themselves).
 *
 * Handles: live parent symlinks, dangling file symlinks, dangling parent
 * symlinks. Same core algorithm as teamMemPaths.ts:realpathDeepestExisting.
 */
export function resolveDeepestExistingAncestorSync(fs, absolutePath) {
    let dir = absolutePath;
    const segments = [];
    // Walk up using lstat (cheap, O(1)) to find the first existing component.
    // lstat does not follow symlinks, so dangling symlinks are detected here.
    // Only call realpathSync (expensive, O(depth)) once at the end.
    while (dir !== nodePath.dirname(dir)) {
        let st;
        try {
            st = fs.lstatSync(dir);
        }
        catch {
            // lstat failed: truly non-existent. Walk up.
            segments.unshift(nodePath.basename(dir));
            dir = nodePath.dirname(dir);
            continue;
        }
        if (st.isSymbolicLink()) {
            // Found a symlink (live or dangling). Try realpath first (resolves
            // chained symlinks); fall back to readlink for dangling symlinks.
            try {
                const resolved = fs.realpathSync(dir);
                return segments.length === 0 ? resolved : nodePath.join(resolved, ...segments);
            }
            catch {
                // Dangling: realpath failed but lstat saw the link entry.
                const target = fs.readlinkSync(dir);
                const absTarget = nodePath.isAbsolute(target) ? target : nodePath.resolve(nodePath.dirname(dir), target);
                return segments.length === 0 ? absTarget : nodePath.join(absTarget, ...segments);
            }
        }
        // Existing non-symlink component. One realpath call resolves any
        // symlinks in its ancestors. If none, return undefined (no symlink).
        try {
            const resolved = fs.realpathSync(dir);
            if (resolved !== dir) {
                return segments.length === 0 ? resolved : nodePath.join(resolved, ...segments);
            }
        }
        catch {
            // realpath can still fail (e.g. EACCES in ancestors). Return
            // undefined — we can't resolve, and the logical path is already
            // in pathSet for the caller.
        }
        return undefined;
    }
    return undefined;
}
/**
 * Gets all paths that should be checked for permissions.
 * This includes the original path, all intermediate symlink targets in the chain,
 * and the final resolved path.
 *
 * For example, if test.txt -> /etc/passwd -> /private/etc/passwd:
 * - test.txt (original path)
 * - /etc/passwd (intermediate symlink target)
 * - /private/etc/passwd (final resolved path)
 *
 * This is important for security: a deny rule for /etc/passwd should block
 * access even if the file is actually at /private/etc/passwd (as on macOS).
 *
 * @param path - The path to check (will be converted to absolute)
 * @returns An array of absolute paths to check permissions for
 */
export function getPathsForPermissionCheck(inputPath) {
    // Expand tilde notation defensively - tools should do this in getPath(),
    // but we normalize here as defense in depth for permission checking
    let path = inputPath;
    if (path === '~') {
        path = homedir().normalize('NFC');
    }
    else if (path.startsWith('~/')) {
        path = nodePath.join(homedir().normalize('NFC'), path.slice(2));
    }
    const pathSet = new Set();
    const fsImpl = getFsImplementation();
    // Always check the original path
    pathSet.add(path);
    // Block UNC paths before any filesystem access to prevent network
    // requests (DNS/SMB) during validation on Windows
    if (path.startsWith('//') || path.startsWith('\\\\')) {
        return Array.from(pathSet);
    }
    // Follow the symlink chain, collecting ALL intermediate targets
    // This handles cases like: test.txt -> /etc/passwd -> /private/etc/passwd
    // We want to check all three paths, not just test.txt and /private/etc/passwd
    try {
        let currentPath = path;
        const visited = new Set();
        const maxDepth = 40; // Prevent runaway loops, matches typical SYMLOOP_MAX
        for (let depth = 0; depth < maxDepth; depth++) {
            // Prevent infinite loops from circular symlinks
            if (visited.has(currentPath)) {
                break;
            }
            visited.add(currentPath);
            if (!fsImpl.existsSync(currentPath)) {
                // Path doesn't exist (new file case). existsSync follows symlinks,
                // so this is also reached for DANGLING symlinks (link entry exists,
                // target doesn't). Resolve symlinks in the path and its ancestors
                // so permission checks see the real destination. Without this,
                // `./data -> /etc/cron.d/` (live parent symlink) or
                // `./evil.txt -> ~/.ssh/authorized_keys2` (dangling file symlink)
                // would allow writes that escape the working directory.
                if (currentPath === path) {
                    const resolved = resolveDeepestExistingAncestorSync(fsImpl, path);
                    if (resolved !== undefined) {
                        pathSet.add(resolved);
                    }
                }
                break;
            }
            const stats = fsImpl.lstatSync(currentPath);
            // Skip special file types that can cause issues
            if (stats.isFIFO() || stats.isSocket() || stats.isCharacterDevice() || stats.isBlockDevice()) {
                break;
            }
            if (!stats.isSymbolicLink()) {
                break;
            }
            // Get the immediate symlink target
            const target = fsImpl.readlinkSync(currentPath);
            // If target is relative, resolve it relative to the symlink's directory
            const absoluteTarget = nodePath.isAbsolute(target)
                ? target
                : nodePath.resolve(nodePath.dirname(currentPath), target);
            // Add this intermediate target to the set
            pathSet.add(absoluteTarget);
            currentPath = absoluteTarget;
        }
    }
    catch {
        // If anything fails during chain traversal, continue with what we have
    }
    // Also add the final resolved path using realpathSync for completeness
    // This handles any remaining symlinks in directory components
    const { resolvedPath, isSymlink } = safeResolvePath(fsImpl, path);
    if (isSymlink && resolvedPath !== path) {
        pathSet.add(resolvedPath);
    }
    return Array.from(pathSet);
}
export const NodeFsOperations = {
    cwd() {
        return process.cwd();
    },
    existsSync(fsPath) {
        const env_1 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_1, slowLogging `fs.existsSync(${fsPath})`, false);
            return fs.existsSync(fsPath);
        }
        catch (e_1) {
            env_1.error = e_1;
            env_1.hasError = true;
        }
        finally {
            __disposeResources(env_1);
        }
    },
    async stat(fsPath) {
        return statPromise(fsPath);
    },
    async readdir(fsPath) {
        return readdirPromise(fsPath, { withFileTypes: true });
    },
    async unlink(fsPath) {
        return unlinkPromise(fsPath);
    },
    async rmdir(fsPath) {
        return rmdirPromise(fsPath);
    },
    async rm(fsPath, options) {
        return rmPromise(fsPath, options);
    },
    async mkdir(dirPath, options) {
        try {
            await mkdirPromise(dirPath, { recursive: true, ...options });
        }
        catch (e) {
            // Bun/Windows: recursive:true throws EEXIST on directories with the
            // FILE_ATTRIBUTE_READONLY bit set (Group Policy, OneDrive, desktop.ini).
            // Bun's directoryExistsAt misclassifies DIRECTORY+READONLY as not-a-dir
            // (bun-internal src/sys.zig existsAtType). The dir exists; ignore.
            // https://github.com/anthropics/claude-code/issues/30924
            if (getErrnoCode(e) !== 'EEXIST')
                throw e;
        }
    },
    async readFile(fsPath, options) {
        return readFilePromise(fsPath, { encoding: options.encoding });
    },
    async rename(oldPath, newPath) {
        return renamePromise(oldPath, newPath);
    },
    statSync(fsPath) {
        const env_2 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_2, slowLogging `fs.statSync(${fsPath})`, false);
            return fs.statSync(fsPath);
        }
        catch (e_2) {
            env_2.error = e_2;
            env_2.hasError = true;
        }
        finally {
            __disposeResources(env_2);
        }
    },
    lstatSync(fsPath) {
        const env_3 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_3, slowLogging `fs.lstatSync(${fsPath})`, false);
            return fs.lstatSync(fsPath);
        }
        catch (e_3) {
            env_3.error = e_3;
            env_3.hasError = true;
        }
        finally {
            __disposeResources(env_3);
        }
    },
    readFileSync(fsPath, options) {
        const env_4 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_4, slowLogging `fs.readFileSync(${fsPath})`, false);
            return fs.readFileSync(fsPath, { encoding: options.encoding });
        }
        catch (e_4) {
            env_4.error = e_4;
            env_4.hasError = true;
        }
        finally {
            __disposeResources(env_4);
        }
    },
    readFileBytesSync(fsPath) {
        const env_5 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_5, slowLogging `fs.readFileBytesSync(${fsPath})`, false);
            return fs.readFileSync(fsPath);
        }
        catch (e_5) {
            env_5.error = e_5;
            env_5.hasError = true;
        }
        finally {
            __disposeResources(env_5);
        }
    },
    readSync(fsPath, options) {
        const env_6 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_6, slowLogging `fs.readSync(${fsPath}, ${options.length} bytes)`, false);
            let fd;
            try {
                fd = fs.openSync(fsPath, 'r');
                const buffer = Buffer.alloc(options.length);
                const bytesRead = fs.readSync(fd, buffer, 0, options.length, 0);
                return { buffer, bytesRead };
            }
            finally {
                if (fd)
                    fs.closeSync(fd);
            }
        }
        catch (e_6) {
            env_6.error = e_6;
            env_6.hasError = true;
        }
        finally {
            __disposeResources(env_6);
        }
    },
    appendFileSync(path, data, options) {
        const env_7 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_7, slowLogging `fs.appendFileSync(${path}, ${data.length} chars)`, false);
            // For new files with explicit mode, use 'ax' (atomic create-with-mode) to avoid
            // TOCTOU race between existence check and open. Fall back to normal append if exists.
            if (options?.mode !== undefined) {
                try {
                    const fd = fs.openSync(path, 'ax', options.mode);
                    try {
                        fs.appendFileSync(fd, data);
                    }
                    finally {
                        fs.closeSync(fd);
                    }
                    return;
                }
                catch (e) {
                    if (getErrnoCode(e) !== 'EEXIST')
                        throw e;
                    // File exists — fall through to normal append
                }
            }
            fs.appendFileSync(path, data);
        }
        catch (e_7) {
            env_7.error = e_7;
            env_7.hasError = true;
        }
        finally {
            __disposeResources(env_7);
        }
    },
    copyFileSync(src, dest) {
        const env_8 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_8, slowLogging `fs.copyFileSync(${src} → ${dest})`, false);
            fs.copyFileSync(src, dest);
        }
        catch (e_8) {
            env_8.error = e_8;
            env_8.hasError = true;
        }
        finally {
            __disposeResources(env_8);
        }
    },
    unlinkSync(path) {
        const env_9 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_9, slowLogging `fs.unlinkSync(${path})`, false);
            fs.unlinkSync(path);
        }
        catch (e_9) {
            env_9.error = e_9;
            env_9.hasError = true;
        }
        finally {
            __disposeResources(env_9);
        }
    },
    renameSync(oldPath, newPath) {
        const env_10 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_10, slowLogging `fs.renameSync(${oldPath} → ${newPath})`, false);
            fs.renameSync(oldPath, newPath);
        }
        catch (e_10) {
            env_10.error = e_10;
            env_10.hasError = true;
        }
        finally {
            __disposeResources(env_10);
        }
    },
    linkSync(target, path) {
        const env_11 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_11, slowLogging `fs.linkSync(${target} → ${path})`, false);
            fs.linkSync(target, path);
        }
        catch (e_11) {
            env_11.error = e_11;
            env_11.hasError = true;
        }
        finally {
            __disposeResources(env_11);
        }
    },
    symlinkSync(target, path, type) {
        const env_12 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_12, slowLogging `fs.symlinkSync(${target} → ${path})`, false);
            fs.symlinkSync(target, path, type);
        }
        catch (e_12) {
            env_12.error = e_12;
            env_12.hasError = true;
        }
        finally {
            __disposeResources(env_12);
        }
    },
    readlinkSync(path) {
        const env_13 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_13, slowLogging `fs.readlinkSync(${path})`, false);
            return fs.readlinkSync(path);
        }
        catch (e_13) {
            env_13.error = e_13;
            env_13.hasError = true;
        }
        finally {
            __disposeResources(env_13);
        }
    },
    realpathSync(path) {
        const env_14 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_14, slowLogging `fs.realpathSync(${path})`, false);
            return fs.realpathSync(path).normalize('NFC');
        }
        catch (e_14) {
            env_14.error = e_14;
            env_14.hasError = true;
        }
        finally {
            __disposeResources(env_14);
        }
    },
    mkdirSync(dirPath, options) {
        const env_15 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_15, slowLogging `fs.mkdirSync(${dirPath})`, false);
            const mkdirOptions = {
                recursive: true,
            };
            if (options?.mode !== undefined) {
                mkdirOptions.mode = options.mode;
            }
            try {
                fs.mkdirSync(dirPath, mkdirOptions);
            }
            catch (e) {
                // Bun/Windows: recursive:true throws EEXIST on directories with the
                // FILE_ATTRIBUTE_READONLY bit set (Group Policy, OneDrive, desktop.ini).
                // Bun's directoryExistsAt misclassifies DIRECTORY+READONLY as not-a-dir
                // (bun-internal src/sys.zig existsAtType). The dir exists; ignore.
                // https://github.com/anthropics/claude-code/issues/30924
                if (getErrnoCode(e) !== 'EEXIST')
                    throw e;
            }
        }
        catch (e_15) {
            env_15.error = e_15;
            env_15.hasError = true;
        }
        finally {
            __disposeResources(env_15);
        }
    },
    readdirSync(dirPath) {
        const env_16 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_16, slowLogging `fs.readdirSync(${dirPath})`, false);
            return fs.readdirSync(dirPath, { withFileTypes: true });
        }
        catch (e_16) {
            env_16.error = e_16;
            env_16.hasError = true;
        }
        finally {
            __disposeResources(env_16);
        }
    },
    readdirStringSync(dirPath) {
        const env_17 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_17, slowLogging `fs.readdirStringSync(${dirPath})`, false);
            return fs.readdirSync(dirPath);
        }
        catch (e_17) {
            env_17.error = e_17;
            env_17.hasError = true;
        }
        finally {
            __disposeResources(env_17);
        }
    },
    isDirEmptySync(dirPath) {
        const env_18 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_18, slowLogging `fs.isDirEmptySync(${dirPath})`, false);
            const files = this.readdirSync(dirPath);
            return files.length === 0;
        }
        catch (e_18) {
            env_18.error = e_18;
            env_18.hasError = true;
        }
        finally {
            __disposeResources(env_18);
        }
    },
    rmdirSync(dirPath) {
        const env_19 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_19, slowLogging `fs.rmdirSync(${dirPath})`, false);
            fs.rmdirSync(dirPath);
        }
        catch (e_19) {
            env_19.error = e_19;
            env_19.hasError = true;
        }
        finally {
            __disposeResources(env_19);
        }
    },
    rmSync(path, options) {
        const env_20 = { stack: [], error: void 0, hasError: false };
        try {
            const _ = __addDisposableResource(env_20, slowLogging `fs.rmSync(${path})`, false);
            fs.rmSync(path, options);
        }
        catch (e_20) {
            env_20.error = e_20;
            env_20.hasError = true;
        }
        finally {
            __disposeResources(env_20);
        }
    },
    createWriteStream(path) {
        return fs.createWriteStream(path);
    },
    async readFileBytes(fsPath, maxBytes) {
        if (maxBytes === undefined) {
            return readFilePromise(fsPath);
        }
        const handle = await open(fsPath, 'r');
        try {
            const { size } = await handle.stat();
            const readSize = Math.min(size, maxBytes);
            const buffer = Buffer.allocUnsafe(readSize);
            let offset = 0;
            while (offset < readSize) {
                const { bytesRead } = await handle.read(buffer, offset, readSize - offset, offset);
                if (bytesRead === 0)
                    break;
                offset += bytesRead;
            }
            return offset < readSize ? buffer.subarray(0, offset) : buffer;
        }
        finally {
            await handle.close();
        }
    },
};
// The currently active filesystem implementation
let activeFs = NodeFsOperations;
/**
 * Overrides the filesystem implementation. Note: This function does not
 * automatically update cwd.
 * @param implementation The filesystem implementation to use
 */
export function setFsImplementation(implementation) {
    activeFs = implementation;
}
/**
 * Gets the currently active filesystem implementation
 * @returns The currently active filesystem implementation
 */
export function getFsImplementation() {
    return activeFs;
}
/**
 * Resets the filesystem implementation to the default Node.js implementation.
 * Note: This function does not automatically update cwd.
 */
export function setOriginalFsImplementation() {
    activeFs = NodeFsOperations;
}
/**
 * Read up to `maxBytes` from a file starting at `offset`.
 * Returns a flat string from Buffer — no sliced string references to a
 * larger parent. Returns null if the file is smaller than the offset.
 */
export async function readFileRange(path, offset, maxBytes) {
    const env_21 = { stack: [], error: void 0, hasError: false };
    try {
        const fh = __addDisposableResource(env_21, await open(path, 'r'), true);
        const size = (await fh.stat()).size;
        if (size <= offset) {
            return null;
        }
        const bytesToRead = Math.min(size - offset, maxBytes);
        const buffer = Buffer.allocUnsafe(bytesToRead);
        let totalRead = 0;
        while (totalRead < bytesToRead) {
            const { bytesRead } = await fh.read(buffer, totalRead, bytesToRead - totalRead, offset + totalRead);
            if (bytesRead === 0) {
                break;
            }
            totalRead += bytesRead;
        }
        return {
            content: buffer.toString('utf8', 0, totalRead),
            bytesRead: totalRead,
            bytesTotal: size,
        };
    }
    catch (e_21) {
        env_21.error = e_21;
        env_21.hasError = true;
    }
    finally {
        const result_1 = __disposeResources(env_21);
        if (result_1)
            await result_1;
    }
}
/**
 * Read the last `maxBytes` of a file.
 * Returns the whole file if it's smaller than maxBytes.
 */
export async function tailFile(path, maxBytes) {
    const env_22 = { stack: [], error: void 0, hasError: false };
    try {
        const fh = __addDisposableResource(env_22, await open(path, 'r'), true);
        const size = (await fh.stat()).size;
        if (size === 0) {
            return { content: '', bytesRead: 0, bytesTotal: 0 };
        }
        const offset = Math.max(0, size - maxBytes);
        const bytesToRead = size - offset;
        const buffer = Buffer.allocUnsafe(bytesToRead);
        let totalRead = 0;
        while (totalRead < bytesToRead) {
            const { bytesRead } = await fh.read(buffer, totalRead, bytesToRead - totalRead, offset + totalRead);
            if (bytesRead === 0) {
                break;
            }
            totalRead += bytesRead;
        }
        return {
            content: buffer.toString('utf8', 0, totalRead),
            bytesRead: totalRead,
            bytesTotal: size,
        };
    }
    catch (e_22) {
        env_22.error = e_22;
        env_22.hasError = true;
    }
    finally {
        const result_2 = __disposeResources(env_22);
        if (result_2)
            await result_2;
    }
}
/**
 * Async generator that yields lines from a file in reverse order.
 * Reads the file backwards in chunks to avoid loading the entire file into memory.
 * @param path - The path to the file to read
 * @returns An async generator that yields lines in reverse order
 */
export async function* readLinesReverse(path) {
    const CHUNK_SIZE = 1024 * 4;
    const fileHandle = await open(path, 'r');
    try {
        const stats = await fileHandle.stat();
        let position = stats.size;
        // Carry raw bytes (not a decoded string) across chunk boundaries so that
        // multi-byte UTF-8 sequences split by the 4KB boundary are not corrupted.
        // Decoding per-chunk would turn a split sequence into U+FFFD on both sides,
        // which for history.jsonl means JSON.parse throws and the entry is dropped.
        let remainder = Buffer.alloc(0);
        const buffer = Buffer.alloc(CHUNK_SIZE);
        while (position > 0) {
            const currentChunkSize = Math.min(CHUNK_SIZE, position);
            position -= currentChunkSize;
            await fileHandle.read(buffer, 0, currentChunkSize, position);
            const combined = Buffer.concat([buffer.subarray(0, currentChunkSize), remainder]);
            const firstNewline = combined.indexOf(0x0a);
            if (firstNewline === -1) {
                remainder = combined;
                continue;
            }
            remainder = Buffer.from(combined.subarray(0, firstNewline));
            const lines = combined.toString('utf8', firstNewline + 1).split('\n');
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                if (line) {
                    yield line;
                }
            }
        }
        if (remainder.length > 0) {
            yield remainder.toString('utf8');
        }
    }
    finally {
        await fileHandle.close();
    }
}
