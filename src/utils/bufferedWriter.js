export function createBufferedWriter({ writeFn, flushIntervalMs = 1000, maxBufferSize = 100, maxBufferBytes = Infinity, immediateMode = false, }) {
    let buffer = [];
    let bufferBytes = 0;
    let flushTimer = null;
    // Batch detached by overflow that hasn't been written yet. Tracked so
    // flush()/dispose() can drain it synchronously if the process exits
    // before the setImmediate fires.
    let pendingOverflow = null;
    function clearTimer() {
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    }
    function flush() {
        if (pendingOverflow) {
            writeFn(pendingOverflow.join(''));
            pendingOverflow = null;
        }
        if (buffer.length === 0)
            return;
        writeFn(buffer.join(''));
        buffer = [];
        bufferBytes = 0;
        clearTimer();
    }
    function scheduleFlush() {
        if (!flushTimer) {
            flushTimer = setTimeout(flush, flushIntervalMs);
        }
    }
    // Detach the buffer synchronously so the caller never waits on writeFn.
    // writeFn may block (e.g. errorLogSink.ts appendFileSync) — if overflow fires
    // mid-render or mid-keystroke, deferring the write keeps the current tick
    // short. Timer-based flushes already run outside user code paths so they
    // stay synchronous.
    function flushDeferred() {
        if (pendingOverflow) {
            // A previous overflow write is still queued. Coalesce into it to
            // preserve ordering — writes land in a single setImmediate-ordered batch.
            pendingOverflow.push(...buffer);
            buffer = [];
            bufferBytes = 0;
            clearTimer();
            return;
        }
        const detached = buffer;
        buffer = [];
        bufferBytes = 0;
        clearTimer();
        pendingOverflow = detached;
        setImmediate(() => {
            const toWrite = pendingOverflow;
            pendingOverflow = null;
            if (toWrite)
                writeFn(toWrite.join(''));
        });
    }
    return {
        write(content) {
            if (immediateMode) {
                writeFn(content);
                return;
            }
            buffer.push(content);
            bufferBytes += content.length;
            scheduleFlush();
            if (buffer.length >= maxBufferSize || bufferBytes >= maxBufferBytes) {
                flushDeferred();
            }
        },
        flush,
        dispose() {
            flush();
        },
    };
}
