/**
 * AuditLogWriter — NDJSON-structured audit log file writer with rotation.
 *
 * Writes structured audit events as newline-delimited JSON (.ndjson) to a
 * configurable directory. Handles log rotation at configurable size limits
 * with a fixed retention policy (oldest files are pruned).
 *
 * Output is compatible with:
 * - Splunk HEC (JSON event format — one event per line)
 * - Datadog JSON log intake
 * - Elastic ECS (partial mapping, each line is a separate doc)
 * - OpenTelemetry log export via filebeat/fluentd tailing
 */

import { appendFile, mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AuditEvent, AuditLogConfig } from './types.js';

/** Default audit log directory relative to project root */
const DEFAULT_AUDIT_PATH = '.clew/audit';

/** Default max file size before rotation: 100 MB */
const DEFAULT_MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

/** Default max rotated files to keep */
const DEFAULT_MAX_FILES = 10;

/** Prefix for rotated audit log files */
const ROTATED_PREFIX = 'audit';

export interface AuditLogWriterOptions {
  /** Project root directory (used to resolve relative audit paths) */
  projectDir: string;
  /** Audit log configuration */
  config?: Partial<AuditLogConfig>;
}

export class AuditLogWriter {
  private readonly config: Required<AuditLogConfig>;
  private readonly auditDir: string;
  private currentFilePath: string;
  private currentSize = 0;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private buffer: string[] = [];
  private readonly FLUSH_INTERVAL_MS = 2000; // flush every 2s
  private closed = false;

  constructor(opts: AuditLogWriterOptions) {
    const cfg = opts.config ?? {};
    this.config = {
      enabled: cfg.enabled ?? true,
      path: cfg.path ?? DEFAULT_AUDIT_PATH,
      maxFileSizeBytes: cfg.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES,
      maxFiles: cfg.maxFiles ?? DEFAULT_MAX_FILES,
      includedEvents: cfg.includedEvents ?? [],
      excludedEvents: cfg.excludedEvents ?? [],
      minLevel: cfg.minLevel ?? 'info',
      consoleOutput: cfg.consoleOutput ?? false,
    };

    // Resolve audit directory (relative paths are relative to project root)
    this.auditDir = resolve(opts.projectDir, this.config.path);
    this.currentFilePath = join(this.auditDir, `${ROTATED_PREFIX}.ndjson`);
  }

  /**
   * Initialize the audit log writer.
   * Creates the audit directory if it doesn't exist.
   * Must be called before `write()`.
   */
  async init(): Promise<void> {
    if (!this.config.enabled) return;

    await mkdir(this.auditDir, { recursive: true });

    // Check if current file already exists and get its size
    try {
      const stats = await stat(this.currentFilePath);
      this.currentSize = stats.size;
    } catch {
      this.currentSize = 0;
    }

    // Start periodic flush timer
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    if (typeof this.flushTimer === 'object' && this.flushTimer !== null && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  /**
   * Write an audit event to the log.
   * Events are batched in memory and flushed periodically.
   */
  write(event: AuditEvent): void {
    if (!this.config.enabled || this.closed) return;

    // Filter by event category
    if (this.config.includedEvents.length > 0 && !this.config.includedEvents.includes(event.event)) {
      return;
    }
    if (this.config.excludedEvents.includes(event.event)) {
      return;
    }

    // Filter by minimum level
    const levelOrder: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3, audit: 4 };
    const eventLevel = levelOrder[event.level] ?? 0;
    const minLevel = levelOrder[this.config.minLevel] ?? 0;
    if (eventLevel < minLevel) return;

    const line = `${JSON.stringify(event)}\n`;
    this.buffer.push(line);

    // Console output for real-time debugging
    if (this.config.consoleOutput) {
      // Use process.stderr to avoid interfering with stdout-based structured output
      process.stderr.write(`[audit] ${event.event}: ${JSON.stringify(event).slice(0, 200)}...\n`);
    }
  }

  /**
   * Flush buffered events to disk.
   * Automatically called on a timer and on `close()`.
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const lines = this.buffer.splice(0, this.buffer.length);
    const content = lines.join('');
    const contentSize = Buffer.byteLength(content);

    try {
      await mkdir(this.auditDir, { recursive: true });

      // Check if rotation is needed before writing
      if (this.currentSize > 0 && this.currentSize + contentSize > this.config.maxFileSizeBytes) {
        await this.rotate();
      }

      await appendFile(this.currentFilePath, content, 'utf-8');
      this.currentSize += contentSize;
    } catch (err) {
      // If rotation failed or write failed, put lines back in buffer
      this.buffer.unshift(...lines);
      process.stderr.write(`[audit] ERROR: failed to write audit log: ${err}\n`);
    }
  }

  /**
   * Rotate the audit log file.
   * Renames current file with timestamp suffix and prunes old files.
   */
  private async rotate(): Promise<void> {
    const timestamp = Date.now();
    const rotatedName = `${ROTATED_PREFIX}.${timestamp}.ndjson`;
    const rotatedPath = join(this.auditDir, rotatedName);

    await rename(this.currentFilePath, rotatedPath);
    this.currentSize = 0;

    // Prune old rotated files beyond retention limit
    await this.pruneOldFiles();
  }

  /**
   * Remove oldest rotated audit files beyond the configured retention limit.
   */
  private async pruneOldFiles(): Promise<void> {
    try {
      const files = await readdir(this.auditDir);
      const rotatedFiles = files
        .filter(f => f.startsWith(`${ROTATED_PREFIX}.`) && f.endsWith('.ndjson') && f !== `${ROTATED_PREFIX}.ndjson`)
        .map(f => ({
          name: f,
          path: join(this.auditDir, f),
          timestamp: parseFloat(f.replace(`${ROTATED_PREFIX}.`, '').replace('.ndjson', '')),
        }))
        .sort((a, b) => b.timestamp - a.timestamp); // newest first

      // Remove files beyond retention limit
      if (rotatedFiles.length >= this.config.maxFiles) {
        const toRemove = rotatedFiles.slice(this.config.maxFiles - 1); // keep maxFiles-1 + current
        for (const file of toRemove) {
          await unlink(file.path);
        }
      }
    } catch {
      // Best-effort pruning; don't block writes
    }
  }

  /**
   * Cleanly shut down the audit log writer.
   * Flushes all buffered events and stops the flush timer.
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    await this.flush();
    this.closed = true;
  }

  /** Get the current audit directory path */
  getDirectory(): string {
    return this.auditDir;
  }
}
